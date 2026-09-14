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

  const { data: members, error } = await supabase
    .from("conversation_members")
    .select(`
      *,
      user:profiles!conversation_members_user_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq("conversation_id", id)
    .order("joined_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    members: members?.map(m => ({
      ...m.user,
      role: m.role,
      joined_at: m.joined_at,
    })) || [],
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
  const { userIds } = body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: "User IDs required" }, { status: 400 });
  }

  // Check if user is a member
  const { data: membership } = await supabase
    .from("conversation_members")
    .select("id")
    .eq("conversation_id", id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("type")
    .eq("id", id)
    .single();

  if (!conversation || conversation.type !== "group") {
    return NextResponse.json({ error: "Can only add members to group conversations" }, { status: 400 });
  }

  const memberInserts = userIds.map(userId => ({
    conversation_id: id,
    user_id: userId,
    role: "member",
  }));

  const { error } = await supabase
    .from("conversation_members")
    .insert(memberInserts);

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Some users are already members" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify new members
  for (const userId of userIds) {
    if (userId !== user.id) {
      await supabase
        .from("notifications")
        .insert({
          recipient_id: userId,
          actor_id: user.id,
          type: "message",
          title: "Added to group",
          message: "added you to a group conversation",
          data: { conversation_id: id },
        });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, memberId } = await params;

  // Check permissions
  const { data: membership } = await supabase
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", id)
    .eq("user_id", user.id)
    .single();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("created_by")
    .eq("id", id)
    .single();

  const isCreator = conversation?.created_by === user.id;
  const isAdmin = membership?.role === "admin";
  const isSelf = memberId === user.id;

  if (!isSelf && !isCreator && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (memberId === conversation?.created_by && !isCreator) {
    return NextResponse.json({ error: "Cannot remove creator" }, { status: 403 });
  }

  const { error } = await supabase
    .from("conversation_members")
    .delete()
    .eq("conversation_id", id)
    .eq("user_id", memberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}