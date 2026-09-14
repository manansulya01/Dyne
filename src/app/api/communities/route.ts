import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { communityCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  // Escape wildcard characters so user search input can't inject patterns.
  const escapeLike = (s: string) => s.replace(/[%_,\\]/g, (m) => `\\${m}`);

  let query = supabase
    .from("communities")
    .select(`
      *,
      owner:profiles!communities_owner_id_fkey(id, username, display_name, avatar_url),
      members:community_members(count)
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  if (search) {
    const safe = escapeLike(search);
    query = query.or(`name.ilike.%${safe}%,description.ilike.%${safe}%`);
  }

  const { data: communities, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const currentUserId = user.id;

  // Batch membership lookup (avoids !inner which hides empty communities).
  const communityIds = (communities ?? []).map((c) => c.id);
  const membershipMap = new Map<string, string>();
  if (communityIds.length > 0) {
    const { data: memberships } = await supabase
      .from("community_members")
      .select("community_id, role")
      .eq("user_id", currentUserId)
      .in("community_id", communityIds);
    for (const m of memberships ?? []) membershipMap.set(m.community_id, m.role);
  }

  const transformedCommunities = communities?.map(community => {
    const memberRole = membershipMap.get(community.id);
    const isMember = !!memberRole;
    const isOwner = community.owner_id === currentUserId;

    return {
      ...community,
      member_count: community.members?.[0]?.count || 0,
      is_member: isMember,
      is_owner: isOwner,
      member_role: memberRole || "none",
    };
  }) || [];

  return NextResponse.json({
    communities: transformedCommunities,
    cursor: transformedCommunities[transformedCommunities.length - 1]?.created_at || null,
    hasMore: transformedCommunities.length === limit,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const validated = communityCreateSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { data: community, error } = await supabase
    .from("communities")
    .insert({
      name: validated.data.name,
      slug: validated.data.slug,
      description: validated.data.description ?? null,
      is_private: validated.data.isPrivate ?? false,
      owner_id: user.id,
    })
    .select(`
      *,
      owner:profiles!communities_owner_id_fkey(id, username, display_name, avatar_url)
    `)
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: { slug: ["Slug already taken"] } }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Add owner as member
  await supabase
    .from("community_members")
    .insert({
      community_id: community.id,
      user_id: user.id,
      role: "owner",
    });

  return NextResponse.json({ community });
}