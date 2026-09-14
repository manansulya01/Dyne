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

  // Check membership
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
    .from("community_posts")
    .select(`
      *,
      author:profiles!community_posts_author_id_fkey(id, username, display_name, avatar_url),
      reaction_count:reactions(count),
      comment_count:comments(count)
    `)
    .eq("community_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: posts, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const transformedPosts = posts?.map(post => ({
    ...post,
    reaction_count: post.reaction_count?.[0]?.count || 0,
    comment_count: post.comment_count?.[0]?.count || 0,
  })) || [];

  return NextResponse.json({
    posts: transformedPosts,
    cursor: transformedPosts[transformedPosts.length - 1]?.created_at || null,
    hasMore: transformedPosts.length === limit,
  });
}