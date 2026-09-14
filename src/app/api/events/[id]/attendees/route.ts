import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const status = searchParams.get("status");

  // Check if user can view attendees
  const { data: event } = await supabase
    .from("events")
    .select("is_public, organizer_id")
    .eq("id", id)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (!event.is_public && event.organizer_id !== user.id) {
    const { data: attendee } = await supabase
      .from("event_attendees")
      .select("status")
      .eq("event_id", id)
      .eq("user_id", user.id)
      .single();

    if (!attendee) {
      return NextResponse.json({ error: "This event is private" }, { status: 403 });
    }
  }

  let query = supabase
    .from("event_attendees")
    .select(`
      *,
      user:profiles!event_attendees_user_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq("event_id", id)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data: attendees, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    attendees: attendees?.map(a => ({
      ...a.user,
      status: a.status,
      rsvp_at: a.created_at,
    })) || [],
    cursor: attendees?.[attendees.length - 1]?.created_at || null,
    hasMore: attendees?.length === limit,
  });
}

export async function POST(
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
  const { status = "going" } = body;

  if (!["going", "interested", "declined"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, max_attendees")
    .eq("id", id)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.max_attendees) {
    const { count } = await supabase
      .from("event_attendees")
      .select("*", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("status", "going");

    if (count && count >= event.max_attendees && status === "going") {
      return NextResponse.json({ error: "Event is full" }, { status: 400 });
    }
  }

  const { error } = await supabase
    .from("event_attendees")
    .upsert({
      event_id: id,
      user_id: user.id,
      status,
    }, {
      onConflict: "event_id,user_id",
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify organizer
  const { data: eventData } = await supabase
    .from("events")
    .select("organizer_id")
    .eq("id", id)
    .single();

  if (eventData && eventData.organizer_id !== user.id) {
    await supabase
      .from("notifications")
      .insert({
        recipient_id: eventData.organizer_id,
        actor_id: user.id,
        type: "event_rsvp",
        title: "New RSVP",
        message: `RSVP'd ${status} to your event`,
        data: { event_id: id, status },
      });
  }

  return NextResponse.json({ success: true });
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

  const { error } = await supabase
    .from("event_attendees")
    .delete()
    .eq("event_id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}