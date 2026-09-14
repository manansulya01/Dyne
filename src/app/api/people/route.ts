import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const role = searchParams.get("role");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  let query = supabase
    .from("profiles")
    .select(`
      *,
      followers:follows!follows_following_id_fkey(count),
      following:follows!follows_follower_id_fkey(count)
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  if (search) {
    query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
  }

  if (role && role !== "all") {
    query = query.eq("role", role);
  }

  const { data: profiles, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const currentUserId = user.id;

  const transformedProfiles = profiles?.map(profile => ({
    ...profile,
    followers_count: profile.followers?.[0]?.count || 0,
    following_count: profile.following?.[0]?.count || 0,
    is_following: false,
  })) || [];

  // Check follow status for each profile in batch
  if (transformedProfiles.length > 0) {
    const profileIds = transformedProfiles.map(p => p.id);
    const { data: follows } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", currentUserId)
      .in("following_id", profileIds);

    const followingSet = new Set(follows?.map(f => f.following_id) || []);
    
    transformedProfiles.forEach(p => {
      p.is_following = followingSet.has(p.id);
    });
  }

  return NextResponse.json({
    profiles: transformedProfiles,
    cursor: transformedProfiles[transformedProfiles.length - 1]?.created_at || null,
    hasMore: transformedProfiles.length === limit,
  });
}