import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getPostCounts } from "@/lib/db/counts";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { postId } = body;

  if (!postId) {
    return NextResponse.json({ error: "Post ID required" }, { status: 400 });
  }

  const { data: post } = await supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .is("deleted_at", null)
    .single();

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("saved_posts")
    .insert({
      user_id: user.id,
      post_id: postId,
    });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already saved" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("postId");

  if (!postId) {
    return NextResponse.json({ error: "Post ID required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("saved_posts")
    .delete()
    .eq("user_id", user.id)
    .eq("post_id", postId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

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
    .from("saved_posts")
    .select(`
      *,
      post:posts!saved_posts_post_id_fkey(
        *,
        author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url),
        media:post_media(*)
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: savedPosts, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { reactions, comments } = await getPostCounts(
    supabase,
    (savedPosts ?? []).map((sp) => sp.post?.id).filter(Boolean) as string[]
  );

  const posts = savedPosts?.map(sp => ({
    ...sp.post,
    reaction_count: sp.post ? (reactions.get(sp.post.id) ?? 0) : 0,
    comment_count: sp.post ? (comments.get(sp.post.id) ?? 0) : 0,
    saved_at: sp.created_at,
  })).filter(Boolean) || [];

  return NextResponse.json({ posts });
}