import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") || user.id;
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  // Users can only see their own liked posts (reactions are private by user).
  if (userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let reactionQuery = supabase
    .from("reactions")
    .select("target_id, created_at")
    .eq("user_id", user.id)
    .eq("target_type", "post")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) reactionQuery = reactionQuery.lt("created_at", cursor);

  const { data: reactions, error: reactionError } = await reactionQuery;
  if (reactionError) {
    return NextResponse.json({ error: reactionError.message }, { status: 500 });
  }

  const postIds = (reactions ?? []).map((r) => r.target_id);
  if (postIds.length === 0) {
    return NextResponse.json({ posts: [] });
  }

  const { data: posts, error } = await supabase
    .from("posts")
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url),
      media:post_media(*)
    `)
    .in("id", postIds)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Preserve reaction order.
  const order = new Map(postIds.map((id, i) => [id, i]));
  const sorted = (posts ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return NextResponse.json({
    posts: sorted,
    cursor: reactions?.[reactions.length - 1]?.created_at ?? null,
    hasMore: (reactions?.length ?? 0) === limit,
  });
}
