import { Db, ObjectId } from "mongodb";
import { col, type ReactionDoc, type ReactionTargetType } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";

/** Add a reaction. Fails with "duplicate" when it already exists (API contract). */
export async function addReaction(
  db: Db,
  userId: string | ObjectId,
  targetType: ReactionTargetType,
  targetId: string | ObjectId,
  kind = "like"
) {
  // Reactions must reference a real target (no orphan rows).
  const targetCollection =
    targetType === "post" ? "posts" : targetType === "comment" ? "comments" : "videos";
  const target = await col(db, targetCollection).findOne({
    _id: toObjectId(targetId),
  } as never);
  if (!target) return { ok: false as const, reason: "not_found" as const };
  try {
    await col<ReactionDoc>(db, "reactions").insertOne({
      userId: toObjectId(userId),
      targetType,
      targetId: toObjectId(targetId),
      kind,
      createdAt: new Date(),
    } as never);
    return { ok: true as const };
  } catch (err: unknown) {
    if (err instanceof Error && /duplicate key/i.test(err.message)) {
      return { ok: false as const, reason: "duplicate" as const };
    }
    throw err;
  }
}

export async function removeReaction(
  db: Db,
  userId: string | ObjectId,
  targetType: ReactionTargetType,
  targetId: string | ObjectId,
  kind = "like"
) {
  await col<ReactionDoc>(db, "reactions").deleteOne({
    userId: toObjectId(userId),
    targetType,
    targetId: toObjectId(targetId),
    kind,
  } as never);
  return { ok: true as const };
}

/** Toggle a reaction. Returns the resulting state (idempotent both ways). */
export async function toggleReaction(
  db: Db,
  userId: string | ObjectId,
  targetType: ReactionTargetType,
  targetId: string | ObjectId,
  kind = "like"
) {
  const uid = toObjectId(userId);
  const tid = toObjectId(targetId);
  const targetCollection =
    targetType === "post" ? "posts" : targetType === "comment" ? "comments" : "videos";
  const target = await col(db, targetCollection).findOne({ _id: tid } as never);
  if (!target) return { liked: false as const, missing: true as const };
  const existing = await col<ReactionDoc>(db, "reactions").findOne({
    userId: uid,
    targetType,
    targetId: tid,
    kind,
  } as never);
  if (existing) {
    await col<ReactionDoc>(db, "reactions").deleteOne({ _id: existing._id } as never);
    return { liked: false as const };
  }
  await col<ReactionDoc>(db, "reactions").insertOne({
    userId: uid,
    targetType,
    targetId: tid,
    kind,
    createdAt: new Date(),
  } as never);
  return { liked: true as const };
}

/** Batched reaction totals keyed by target id (for comment lists). */
export async function getCommentReactionCounts(
  db: Db,
  commentIds: Array<string | ObjectId>
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (commentIds.length === 0) return counts;
  const rows = await col<ReactionDoc>(db, "reactions")
    .aggregate([
      {
        $match: {
          targetType: "comment",
          targetId: { $in: commentIds.map((id) => toObjectId(id)) },
        },
      },
      { $group: { _id: "$targetId", n: { $sum: 1 } } },
    ])
    .toArray();
  for (const row of rows) counts.set(String(row._id), row.n as number);
  return counts;
}

export async function reactionState(  db: Db,
  userId: string | ObjectId | null,
  targetType: ReactionTargetType,
  targetId: string | ObjectId
) {
  const tid = toObjectId(targetId);
  const [total, mine] = await Promise.all([
    col<ReactionDoc>(db, "reactions").countDocuments({ targetType, targetId: tid } as never),
    userId
      ? col<ReactionDoc>(db, "reactions").findOne({
          userId: toObjectId(userId),
          targetType,
          targetId: tid,
        } as never)
      : null,
  ]);
  return { count: total, userReaction: mine ? mine.kind : null };
}

/** Save / unsave are idempotent. */
export async function savePost(db: Db, userId: string | ObjectId, postId: string | ObjectId) {
  try {
    await col(db, "savedPosts").insertOne({
      userId: toObjectId(userId),
      postId: toObjectId(postId),
      createdAt: new Date(),
    } as never);
    return { saved: true as const };
  } catch (err: unknown) {
    if (err instanceof Error && /duplicate key/i.test(err.message)) {
      return { saved: true as const, already: true as const };
    }
    throw err;
  }
}

export async function unsavePost(db: Db, userId: string | ObjectId, postId: string | ObjectId) {
  await col(db, "savedPosts").deleteOne({
    userId: toObjectId(userId),
    postId: toObjectId(postId),
  } as never);
  return { saved: false as const };
}

export async function isPostSaved(db: Db, userId: string | ObjectId, postId: string | ObjectId) {
  const row = await col(db, "savedPosts").findOne({
    userId: toObjectId(userId),
    postId: toObjectId(postId),
  } as never);
  return !!row;
}
