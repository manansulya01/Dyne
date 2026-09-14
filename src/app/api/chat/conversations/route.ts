import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { messageCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  let query = supabase
    .from("conversations")
    .select(`
      *,
      members:conversation_members!inner(
        user:profiles!conversation_members_user_id_fkey(id, username, display_name, avatar_url)
      ),
      last_message:messages!messages_conversation_id_fkey(
        id,
        content,
        sender_id,
        created_at,
        sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url)
      )
    `)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("updated_at", cursor);
  }

  const { data: conversations, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const currentUserId = user.id;

  const transformedConversations = conversations?.map(conv => {
    const otherMembers = conv.members?.filter((m: any) => m.user?.id !== currentUserId) || [];
    const otherMember = otherMembers[0]?.user;
    
    let unreadCount = 0;
    const memberInfo = conv.members?.find((m: any) => m.user?.id === currentUserId);
    if (memberInfo && conv.last_message) {
      // This would need more complex logic to track unread
    }

    return {
      ...conv,
      other_member: otherMember,
      unread_count: 0,
      last_message: conv.last_message?.[0] || null,
    };
  }) || [];

  return NextResponse.json({
    conversations: transformedConversations,
    cursor: transformedConversations[transformedConversations.length - 1]?.updated_at || null,
    hasMore: transformedConversations.length === limit,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { participantIds, type = "direct" } = body;

  if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
    return NextResponse.json({ error: "Participant IDs required" }, { status: 400 });
  }

  if (type === "direct" && participantIds.length !== 1) {
    return NextResponse.json({ error: "Direct conversations require exactly 1 participant" }, { status: 400 });
  }

  const allParticipantIds = [user.id, ...participantIds];

  // For direct conversations, check if one already exists
  if (type === "direct") {
    const { data: existingConv } = await supabase
      .from("conversations")
      .select(`
        id,
        members:conversation_members!inner(user_id)
      `)
      .eq("type", "direct")
      .in("members.user_id", allParticipantIds)
      .single();

    // Check if it has exactly the right members
    if (existingConv && existingConv.members.length === 2) {
      const memberIds = existingConv.members.map((m: any) => m.user_id).sort();
      const targetIds = allParticipantIds.sort();
      if (JSON.stringify(memberIds) === JSON.stringify(targetIds)) {
        return NextResponse.json({ conversation: existingConv });
      }
    }
  }

  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({
      type,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Add members
  const memberInserts = allParticipantIds.map(userId => ({
    conversation_id: conversation.id,
    user_id: userId,
  }));

  await supabase
    .from("conversation_members")
    .insert(memberInserts);

  // Fetch full conversation with members
  const { data: fullConv } = await supabase
    .from("conversations")
    .select(`
      *,
      members:conversation_members!inner(
        user:profiles!conversation_members_user_id_fkey(id, username, display_name, avatar_url)
      )
    `)
    .eq("id", conversation.id)
    .single();

  return NextResponse.json({ conversation: fullConv });
}