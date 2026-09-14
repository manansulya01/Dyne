import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { eventCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const upcoming = searchParams.get("upcoming") === "true";

  let query = supabase
    .from("events")
    .select(`
      *,
      organizer:profiles!events_organizer_id_fkey(id, username, display_name, avatar_url),
      location:campus_buildings!events_location_id_fkey(id, name),
      attendees:event_attendees(count)
    `)
    .order("start_time", { ascending: true })
    .limit(limit);

  if (upcoming) {
    query = query.gte("start_time", new Date().toISOString());
  }

  if (cursor) {
    query = query.lt("start_time", cursor);
  }

  const { data: events, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const currentUserId = user.id;

  const transformedEvents = events?.map(event => {
    const attendeeStatus: "going" | "interested" | "declined" | null = null;
    const attendee = event.attendees?.[0];
    // We'll fetch user's RSVP separately
    
    return {
      ...event,
      attendee_count: attendee?.count || 0,
      user_rsvp: attendeeStatus,
    };
  }) || [];

  // Fetch user's RSVP status for each event
  if (transformedEvents.length > 0) {
    const eventIds = transformedEvents.map(e => e.id);
    const { data: rsvps } = await supabase
      .from("event_attendees")
      .select("event_id, status")
      .eq("user_id", currentUserId)
      .in("event_id", eventIds);

    const rsvpMap = new Map(rsvps?.map(r => [r.event_id, r.status]) || []);
    
    transformedEvents.forEach(e => {
      e.user_rsvp = rsvpMap.get(e.id) || null;
    });
  }

  return NextResponse.json({
    events: transformedEvents,
    cursor: transformedEvents[transformedEvents.length - 1]?.start_time || null,
    hasMore: transformedEvents.length === limit,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const validated = eventCreateSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // Check if user is authorized to create events
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("role:roles!inner(name)")
    .eq("user_id", user.id)
    .in("roles.name", ["admin", "teacher", "staff", "club"]);

  if (!userRoles || userRoles.length === 0) {
    return NextResponse.json({ error: "Not authorized to create events" }, { status: 403 });
  }

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      ...validated.data,
      organizer_id: user.id,
    })
    .select(`
      *,
      organizer:profiles!events_organizer_id_fkey(id, username, display_name, avatar_url),
      location:campus_buildings!events_location_id_fkey(id, name)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ event });
}