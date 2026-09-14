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

  if (!communityId) {
    return NextResponse.json({ error: "Community ID required" }, { status: 400 });
  }

  const validated = postCreateSchema.safeParse({ content });
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

  // Create post (community posts are text-only; post_media belongs to feed posts).
  const { data: post, error: postError } = await supabase
    .from("community_posts")
    .insert({
      community_id: communityId,
      author_id: user.id,
      content: validated.data.content,
    })
    .select(`
      *,
      author:profiles!community_posts_author_id_fkey(id, username, display_name, avatar_url)
    `)
    .single();

  if (postError) {
    return NextResponse.json({ error: postError.message }, { status: 500 });
  }

  return NextResponse.json({ post: { ...post, media: [] } });
}