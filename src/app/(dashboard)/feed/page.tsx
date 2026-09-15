import { Metadata } from "next";
import { FeedClient } from "./Feed";
import { createClient } from "@/lib/supabase/server";
import { getPostCounts } from "@/lib/db/counts";
import { PostWithRelations } from "@/types";

export const metadata: Metadata = {
  title: "Home - Dyne",
  description: "Your campus feed",
};

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <FeedClient initialPosts={[]} profile={null} />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: posts } = await supabase
    .from("posts")
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url),
      media:post_media(*)
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  const { reactions, comments } = await getPostCounts(
    supabase,
    (posts ?? []).map((p) => p.id)
  );

  const transformedPosts: PostWithRelations[] = posts?.map(post => ({
    ...post,
    reaction_count: reactions.get(post.id) ?? 0,
    comment_count: comments.get(post.id) ?? 0,
  })) || [];

  return <FeedClient initialPosts={transformedPosts} profile={profile} />;
}