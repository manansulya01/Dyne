import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Batched reaction/comment counts for feed posts.
 *
 * PostgREST cannot embed-aggregate `reactions` (polymorphic target_id has no
 * foreign key), so counts are fetched in two batched queries instead of
 * per-post N+1 queries.
 */
export async function getPostCounts(
  supabase: SupabaseClient,
  postIds: string[]
): Promise<{ reactions: Map<string, number>; comments: Map<string, number> }> {
  const reactions = new Map<string, number>();
  const comments = new Map<string, number>();
  if (postIds.length === 0) return { reactions, comments };

  const [{ data: reactionRows }, { data: commentRows }] = await Promise.all([
    supabase
      .from("reactions")
      .select("target_id")
      .eq("target_type", "post")
      .in("target_id", postIds),
    supabase
      .from("comments")
      .select("post_id")
      .in("post_id", postIds)
      .is("deleted_at", null),
  ]);

  for (const row of reactionRows ?? []) {
    reactions.set(row.target_id, (reactions.get(row.target_id) ?? 0) + 1);
  }
  for (const row of commentRows ?? []) {
    comments.set(row.post_id, (comments.get(row.post_id) ?? 0) + 1);
  }

  return { reactions, comments };
}

/** Batched reaction totals for comments (replies use a real FK and can embed). */
export async function getCommentReactionCounts(
  supabase: SupabaseClient,
  commentIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (commentIds.length === 0) return counts;

  const { data } = await supabase
    .from("reactions")
    .select("target_id")
    .eq("target_type", "comment")
    .in("target_id", commentIds);

  for (const row of data ?? []) {
    counts.set(row.target_id, (counts.get(row.target_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Batched reply totals for top-level comments.
 * (PostgREST cannot embed a self-referencing aggregate, so this is batched.)
 */
export async function getCommentReplyCounts(
  supabase: SupabaseClient,
  commentIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (commentIds.length === 0) return counts;

  const { data } = await supabase
    .from("comments")
    .select("parent_comment_id")
    .in("parent_comment_id", commentIds)
    .is("deleted_at", null);

  for (const row of data ?? []) {
    const parent = row.parent_comment_id as string;
    counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }
  return counts;
}
