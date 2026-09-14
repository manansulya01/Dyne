import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { eventCreateSchema } from "@/lib/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: event, error } = await supabase
    .from("events")
    .select(`
      *,
      organizer:profiles!events_organizer_id_fkey(id, username, display_name, avatar_url),
      location:campus_buildings!events_location_id_fkey(id, name),
      attendees:event_attendees(count)
    `)
    .eq("id", id)
    .single();

  if (error || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Check if private event and user is not attendee
  if (!event.is_public) {
    const { data: attendee } = await supabase
      .from("event_attendees")
      .select("status")
      .eq("event_id", id)
      .eq("user_id", user.id)
      .single();

    if (!attendee && event.organizer_id !== user.id) {
      return NextResponse.json({ error: "This event is private" }, { status: 403 });
    }
  }

  const currentUserId = user.id;
  const isOrganizer = event.organizer_id === currentUserId;

  let userRsvp = null;
  const { data: rsvp } = await supabase
    .from("event_attendees")
    .select("status")
    .eq("event_id", id)
    .eq("user_id", currentUserId)
    .single();

  userRsvp = rsvp?.status || null;

  return NextResponse.json({
    event: {
      ...event,
      attendee_count: event.attendees?.[0]?.count || 0,
      is_organizer: isOrganizer,
      user_rsvp: userRsvp,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const validated = eventCreateSchema.partial().safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { data: event } = await supabase
    .from("events")
    .select("organizer_id")
    .eq("id", id)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.organizer_id !== user.id) {
    const isAdmin = await supabase
      .from("user_roles")
      .select("role:roles!inner(name)")
      .eq("user_id", user.id)
      .eq("roles.name", "admin")
      .then(({ data }) => (data?.length ?? 0) > 0);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const camelToSnake: Record<string, string> = {
    title: "title",
    description: "description",
    locationId: "location_id",
    startTime: "start_time",
    endTime: "end_time",
    isPublic: "is_public",
    maxAttendees: "max_attendees",
  };
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(validated.data)) {
    const column = camelToSnake[key];
    if (column && value !== undefined) updatePayload[column] = value;
  }

  const { data: updatedEvent, error } = await supabase
    .from("events")
    .update(updatePayload)
    .eq("id", id)
    .select(`
      *,
      organizer:profiles!events_organizer_id_fkey(id, username, display_name, avatar_url),
      location:campus_buildings!events_location_id_fkey(id, name)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ event: updatedEvent });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: event } = await supabase
    .from("events")
    .select("organizer_id")
    .eq("id", id)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.organizer_id !== user.id) {
    const isAdmin = await supabase
      .from("user_roles")
      .select("role:roles!inner(name)")
      .eq("user_id", user.id)
      .eq("roles.name", "admin")
      .then(({ data }) => (data?.length ?? 0) > 0);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}