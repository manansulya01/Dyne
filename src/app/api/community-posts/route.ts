import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { postCreateSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const content = formData.get("content") as string;
  const communityId = formData.get("communityId") as string;
  const mediaIds = formData.getAll("mediaIds") as string[];

  if (!communityId) {
    return NextResponse.json({ error: "Community ID required" }, { status: 400 });
  }

  const validated = postCreateSchema.safeParse({ content, mediaIds });
  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // Check membership
  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    const { data: community } = await supabase
      .from("communities")
      .select("is_private")
      .eq("id", communityId)
      .single();

    if (community?.is_private) {
      return NextResponse.json({ error: "This community is private" }, { status: 403 });
    }
  }

  // Create post
  const { data: post, error: postError } = await supabase
    .from("community_posts")
    .insert({
      community_id: communityId,
      author_id: user.id,
      content: validated.data.content,
    })
    .select(`
      *,
      author:profiles!community_posts_author_id_fkey(id, username, display_name, avatar_url),
      media:post_media(*)
    `)
    .single();

  if (postError) {
    return NextResponse.json({ error: postError.message }, { status: 500 });
  }

  // Link media if provided
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
    .from("community_posts")
    .select(`
      *,
      author:profiles!community_posts_author_id_fkey(id, username, display_name, avatar_url),
      media:post_media(*)
    `)
    .eq("id", post.id)
    .single();

  return NextResponse.json({ post: fullPost });
}