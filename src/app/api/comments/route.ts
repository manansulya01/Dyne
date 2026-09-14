import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { commentCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("postId");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  if (!postId) {
    return NextResponse.json({ error: "Post ID required" }, { status: 400 });
  }

  let query = supabase
    .from("comments")
    .select(`
      *,
      author:profiles!comments_author_id_fkey(id, username, display_name, avatar_url),
      reaction_count:reactions(count),
      replies:comments!comments_parent_comment_id_fkey(count)
    `)
    .eq("post_id", postId)
    .is("parent_comment_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: comments, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const transformedComments = comments?.map(comment => ({
    ...comment,
    reaction_count: comment.reaction_count?.[0]?.count || 0,
    reply_count: comment.replies?.[0]?.count || 0,
  })) || [];

  return NextResponse.json({ comments: transformedComments });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const validated = commentCreateSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { data: post } = await supabase
    .from("posts")
    .select("author_id")
    .eq("id", validated.data.postId)
    .single();

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (validated.data.parentCommentId) {
    const { data: parentComment } = await supabase
      .from("comments")
      .select("id, post_id")
      .eq("id", validated.data.parentCommentId)
      .single();

    if (!parentComment || parentComment.post_id !== validated.data.postId) {
      return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
    }
  }

  const { data: comment, error } = await supabase
    .from("comments")
    .insert({
      post_id: validated.data.postId,
      author_id: user.id,
      content: validated.data.content,
      parent_comment_id: validated.data.parentCommentId || null,
    })
    .select(`
      *,
      author:profiles!comments_author_id_fkey(id, username, display_name, avatar_url),
      reaction_count:reactions(count)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (post.author_id !== user.id) {
    await supabase
      .from("notifications")
      .insert({
        recipient_id: post.author_id,
        actor_id: user.id,
        type: "comment",
        title: "New comment",
        message: "commented on your post",
        data: { post_id: validated.data.postId, comment_id: comment.id },
      });
  }

  if (validated.data.parentCommentId) {
    const { data: parentComment } = await supabase
      .from("comments")
      .select("author_id")
      .eq("id", validated.data.parentCommentId)
      .single();

    if (parentComment && parentComment.author_id !== user.id) {
      await supabase
        .from("notifications")
        .insert({
          recipient_id: parentComment.author_id,
          actor_id: user.id,
          type: "comment",
          title: "New reply",
          message: "replied to your comment",
          data: { post_id: validated.data.postId, comment_id: comment.id },
        });
    }
  }

  return NextResponse.json({
    comment: {
      ...comment,
      reaction_count: 0,
      reply_count: 0,
    },
  });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const commentId = searchParams.get("id");

  if (!commentId) {
    return NextResponse.json({ error: "Comment ID required" }, { status: 400 });
  }

  const { data: comment } = await supabase
    .from("comments")
    .select("author_id")
    .eq("id", commentId)
    .single();

  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  if (comment.author_id !== user.id) {
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
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}