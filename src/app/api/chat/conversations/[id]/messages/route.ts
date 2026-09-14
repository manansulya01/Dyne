import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { messageCreateSchema } from "@/lib/validation";

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
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  // Check membership
  const { data: membership } = await supabase
    .from("conversation_members")
    .select("id")
    .eq("conversation_id", id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let query = supabase
    .from("messages")
    .select(`
      *,
      sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url),
      attachments:message_attachments(*)
    `)
    .eq("conversation_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: messages, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mark as read
  await supabase
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", id)
    .eq("user_id", user.id);

  return NextResponse.json({
    messages: messages?.reverse() || [],
    cursor: messages?.[0]?.created_at || null,
    hasMore: messages?.length === limit,
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
  const validated = messageCreateSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // Check membership
  const { data: membership } = await supabase
    .from("conversation_members")
    .select("id")
    .eq("conversation_id", id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: id,
      sender_id: user.id,
      content: validated.data.content,
    })
    .select(`
      *,
      sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url),
      attachments:message_attachments(*)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update conversation updated_at
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  // Create notifications for other members
  const { data: members } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", id)
    .neq("user_id", user.id);

  if (members) {
    const notifications = members.map(m => ({
      recipient_id: m.user_id,
      actor_id: user.id,
      type: "message",
      title: "New message",
      message: "sent a message",
      data: { conversation_id: id, message_id: message.id },
    }));

    await supabase.from("notifications").insert(notifications);
  }

  return NextResponse.json({ message });
}