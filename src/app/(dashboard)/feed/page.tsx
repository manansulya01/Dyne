import { Metadata } from "next";
import { FeedClient } from "./Feed";
import { createClient } from "@/lib/supabase/server";
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
      media:post_media(*),
      reaction_count:reactions(count),
      comment_count:comments(count)
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  const transformedPosts: PostWithRelations[] = posts?.map(post => ({
    ...post,
    reaction_count: post.reaction_count?.[0]?.count || 0,
    comment_count: post.comment_count?.[0]?.count || 0,
  })) || [];

  return <FeedClient initialPosts={transformedPosts} profile={profile} />;
}