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

  // Check if user is a member
  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    const { data: community } = await supabase
      .from("communities")
      .select("is_private")
      .eq("id", id)
      .single();
    
    if (community?.is_private) {
      return NextResponse.json({ error: "This community is private" }, { status: 403 });
    }
  }

  let query = supabase
    .from("community_members")
    .select(`
      *,
      user:profiles!community_members_user_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq("community_id", id)
    .order("joined_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("joined_at", cursor);
  }

  const { data: members, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    members: members?.map(m => ({
      ...m.user,
      role: m.role,
      joined_at: m.joined_at,
    })) || [],
    cursor: members?.[members.length - 1]?.joined_at || null,
    hasMore: members?.length === limit,
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

  const { data: community } = await supabase
    .from("communities")
    .select("is_private, owner_id")
    .eq("id", id)
    .single();

  if (!community) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  if (community.is_private && community.owner_id !== user.id) {
    return NextResponse.json({ error: "This community is private" }, { status: 403 });
  }

  const { error } = await supabase
    .from("community_members")
    .insert({
      community_id: id,
      user_id: user.id,
      role: "member",
    });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already a member" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create notification for community owner
  if (community.owner_id !== user.id) {
    await supabase
      .from("notifications")
      .insert({
        recipient_id: community.owner_id,
        actor_id: user.id,
        type: "community_join",
        title: "New member",
        message: "joined your community",
        data: { community_id: id },
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
  const { searchParams } = new URL(request.url);
  // Default to self (leave) when no explicit target is given.
  const targetUserId = searchParams.get("userId") || user.id;

  // Check permissions
  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", id)
    .eq("user_id", user.id)
    .single();

  const { data: community } = await supabase
    .from("communities")
    .select("owner_id")
    .eq("id", id)
    .single();

  const isOwner = community?.owner_id === user.id;
  const isModerator = membership?.role === "moderator";
  const isSelf = targetUserId === user.id;

  if (!isSelf && !isOwner && !isModerator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (targetUserId === community?.owner_id && !isOwner) {
    return NextResponse.json({ error: "Cannot remove owner" }, { status: 403 });
  }

  const { error } = await supabase
    .from("community_members")
    .delete()
    .eq("community_id", id)
    .eq("user_id", targetUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}