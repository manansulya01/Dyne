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

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select(`
      *,
      members:conversation_members!inner(
        user:profiles!conversation_members_user_id_fkey(id, username, display_name, avatar_url),
        role,
        joined_at,
        last_read_at
      )
    `)
    .eq("id", id)
    .single();

  if (error || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Check if user is a member
  const isMember = (conversation.members as Array<{ user: { id: string } | null }> | null)?.some((m) => m.user?.id === user.id);
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ conversation });
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
  const { name, image_url } = body;

  const { data: conversation } = await supabase
    .from("conversations")
    .select("created_by, type")
    .eq("id", id)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Only creator or group members can update
  const { data: membership } = await supabase
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", id)
    .eq("user_id", user.id)
    .single();

  if (!membership || (conversation.created_by !== user.id && conversation.type === "group" && membership.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof name === "string" && name.length > 0 && name.length <= 100) updates.name = name;
  if (typeof image_url === "string" || image_url === null) updates.image_url = image_url;

  const { data: updatedConv, error } = await supabase
    .from("conversations")
    .update(updates)
    .eq("id", id)
    .select(`
      *,
      members:conversation_members!inner(
        user:profiles!conversation_members_user_id_fkey(id, username, display_name, avatar_url)
      )
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversation: updatedConv });
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

  const { data: conversation } = await supabase
    .from("conversations")
    .select("created_by")
    .eq("id", id)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (conversation.created_by !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}