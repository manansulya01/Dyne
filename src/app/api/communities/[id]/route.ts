import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { communityCreateSchema } from "@/lib/validation";

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
      members:community_members(count)
    `)
    .eq("id", id)
    .single();

  if (error || !community) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  // Check if private and user is not a member
  let memberRole = "none";
  {
    const { data: memberData } = await supabase
      .from("community_members")
      .select("role")
      .eq("community_id", id)
      .eq("user_id", user.id)
      .single();
    if (memberData) memberRole = memberData.role;
  }
  if (community.is_private && memberRole === "none" && community.owner_id !== user.id) {
    return NextResponse.json({ error: "This community is private" }, { status: 403 });
  }

  const currentUserId = user.id;
  const isMember = memberRole !== "none";
  const isOwner = community.owner_id === currentUserId;

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
  const validated = communityCreateSchema.partial().safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { data: community } = await supabase
    .from("communities")
    .select("owner_id")
    .eq("id", id)
    .single();

  if (!community) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  let canEdit = community.owner_id === user.id;
  if (!canEdit) {
    const { data: membership } = await supabase
      .from("community_members")
      .select("role")
      .eq("community_id", id)
      .eq("user_id", user.id)
      .single();
    canEdit = membership?.role === "moderator" || membership?.role === "owner";
  }
  if (!canEdit) {
    const { data: admin } = await supabase
      .from("user_roles")
      .select("role:roles!inner(name)")
      .eq("user_id", user.id)
      .eq("roles.name", "admin");
    canEdit = (admin?.length ?? 0) > 0;
  }
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (validated.data.name !== undefined) updatePayload.name = validated.data.name;
  if (validated.data.description !== undefined) updatePayload.description = validated.data.description;
  if (validated.data.isPrivate !== undefined) updatePayload.is_private = validated.data.isPrivate;

  const { data: updated, error } = await supabase
    .from("communities")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ community: updated });
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