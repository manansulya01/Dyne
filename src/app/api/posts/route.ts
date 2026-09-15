import { createClient } from "@/lib/supabase/server";
import { postCreateSchema } from "@/lib/validation";
import { getPostCounts } from "@/lib/db/counts";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const author = searchParams.get("author");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let query = supabase
    .from("posts")
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url),
      media:post_media(*)
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  if (author) {
    const { data: authorProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", author)
      .single();
    if (!authorProfile) {
      return NextResponse.json({ posts: [] });
    }
    query = query.eq("author_id", authorProfile.id);
  }

  const { data: posts, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Batched counts (reactions are polymorphic with no FK, so they cannot
  // be embedded via PostgREST relationship traversal).
  const { reactions, comments } = await getPostCounts(
    supabase,
    (posts ?? []).map((p) => p.id)
  );

  // Transform the data
  const transformedPosts = posts?.map(post => ({
    ...post,
    reaction_count: reactions.get(post.id) ?? 0,
    comment_count: comments.get(post.id) ?? 0,
  })) || [];

  return NextResponse.json({ posts: transformedPosts });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const content = formData.get("content") as string;
  const mediaIds = formData.getAll("mediaIds") as string[];

  const validated = postCreateSchema.safeParse({ content, mediaIds });
  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  if (!validated.data.content?.trim() && (!validated.data.mediaIds || validated.data.mediaIds.length === 0)) {
    return NextResponse.json(
      { error: { content: ["Post must include text or media"] } },
      { status: 400 }
    );
  }

  if (validated.data.mediaIds && validated.data.mediaIds.length > 4) {
    return NextResponse.json(
      { error: { mediaIds: ["Maximum 4 attachments per post"] } },
      { status: 400 }
    );
  }

  // Create post
  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      content: validated.data.content,
    })
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url),
      media:post_media(*)
    `)
    .single();

  if (postError) {
    return NextResponse.json({ error: postError.message }, { status: 500 });
  }

  // Link media if provided - verify ownership first
  if (validated.data.mediaIds && validated.data.mediaIds.length > 0) {
    for (const mediaId of validated.data.mediaIds) {
      const { data: media } = await supabase
        .from("post_media")
        .select("post_id")
        .eq("id", mediaId)
        .single();

      if (media && media.post_id === null) {
        await supabase
          .from("post_media")
          .update({ post_id: post.id })
          .eq("id", mediaId);
      }
    }
  }

  // Refetch with media
  const { data: fullPost } = await supabase
    .from("posts")
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url),
      media:post_media(*)
    `)
    .eq("id", post.id)
    .single();

  return NextResponse.json({ post: fullPost });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("id");

  if (!postId) {
    return NextResponse.json({ error: "Post ID required" }, { status: 400 });
  }

  const { data: post } = await supabase
    .from("posts")
    .select("author_id")
    .eq("id", postId)
    .single();

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.author_id !== user.id) {
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
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", postId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}