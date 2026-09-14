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

  const { data: community, error } = await supabase
    .from("communities")
    .select(`
      *,
      owner:profiles!communities_owner_id_fkey(id, username, display_name, avatar_url),
      members:community_members(count),
      member:community_members!inner(user_id)
    `)
    .eq("id", id)
    .single();

  if (error || !community) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  // Check if private and user is not a member
  if (community.is_private) {
    const { data: membership } = await supabase
      .from("community_members")
      .select("role")
      .eq("community_id", id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "This community is private" }, { status: 403 });
    }
  }

  const currentUserId = user.id;
  const isMember = community.member?.some((m: { user_id: string }) => m.user_id === currentUserId) || false;
  const isOwner = community.owner_id === currentUserId;

  let memberRole = "none";
  if (isMember) {
    const { data: memberData } = await supabase
      .from("community_members")
      .select("role")
      .eq("community_id", id)
      .eq("user_id", currentUserId)
      .single();
    memberRole = memberData?.role || "member";
  }

  return NextResponse.json({
    community: {
      ...community,
      member_count: community.members?.[0]?.count || 0,
      is_member: isMember,
      is_owner: isOwner,
      member_role: memberRole,
    },
  });
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

  const { data: community } = await supabase
    .from("communities")
    .select("owner_id")
    .eq("id", id)
    .single();

  if (!community) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  if (community.owner_id !== user.id) {
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
    .from("communities")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}