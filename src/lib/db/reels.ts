import { Db, ObjectId } from "mongodb";
import { col, type ReelDoc, type ReelViewDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serialize, serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";
import { moderateContent } from "@/lib/moderation";
import { createNotification } from "./notifications";

/**
 * Reels repository (vertical 9:16 short-form).
 *
 * Deliberately separate from horizontal videos: separate collection, separate
 * feed semantics, separate UX. Shared infrastructure (storage, moderation,
 * reactions) is reused rather than duplicated.
 */

/** Media URLs must be app-served (/api/files/…) or absolute http(s). */
export function isSafeMediaUrl(value: unknown, maxLength = 2000): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    (value.startsWith("/api/files/") || /^https?:\/\/.+/i.test(value))
  );
}

export interface CreateReelInput {
  title: string;
  caption?: string | null;
  videoUrl: string;
  thumbnailUrl?: string | null;
  category?: string | null;
  hashtags?: string[];
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
}

export async function createReel(
  db: Db,
  creatorId: string | ObjectId,
  input: CreateReelInput
): Promise<
  | { ok: true; reelId: ObjectId; moderationStatus: ReelDoc["moderationStatus"] }
  | { ok: false; reason: "bad_title" | "bad_url" | "bad_thumbnail" | "bad_hashtags" }
> {
  const title = input.title.trim();
  if (title.length < 3 || title.length > 200) return { ok: false, reason: "bad_title" };
  if (!isSafeMediaUrl(input.videoUrl)) return { ok: false, reason: "bad_url" };
  if (input.thumbnailUrl != null && !isSafeMediaUrl(input.thumbnailUrl)) {
    return { ok: false, reason: "bad_thumbnail" };
  }
  const hashtags = (input.hashtags ?? [])
    .map((h) => h.trim().replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 30))
    .filter(Boolean)
    .slice(0, 10);
  if ((input.hashtags ?? []).length > 20) return { ok: false, reason: "bad_hashtags" };

  const now = new Date();
  const aspect =
    input.width && input.height ? `${input.width}:${input.height}` : null;

  const res = await col<ReelDoc>(db, "reels").insertOne({
    title,
    caption: input.caption?.trim().slice(0, 2000) || null,
    videoUrl: input.videoUrl,
    thumbnailUrl: input.thumbnailUrl ?? null,
    creatorId: toObjectId(creatorId),
    durationSeconds:
      typeof input.durationSeconds === "number" && Number.isFinite(input.durationSeconds)
        ? Math.max(0, Math.round(input.durationSeconds))
        : null,
    viewCount: 0,
    likeCount: 0,
    saveCount: 0,
    shareCount: 0,
    commentCount: 0,
    category: input.category?.trim().slice(0, 50) || null,
    hashtags,
    aspectRatio: aspect,
    width: input.width ?? null,
    height: input.height ?? null,
    // Provisional: the pipeline below sets the real status before insert of
    // the review record. Reels start undecided so nothing publishes unreviewed.
    moderationStatus: "pending",
    moderationReason: null,
    moderationScore: null,
    moderationSource: null,
    moderationProvider: null,
    moderationMediaAnalyzed: false,
    moderatedAt: now,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  } as never);

  const reelId = res.insertedId;
  const moderation = await moderateContent(db, {
    contentType: "reel",
    contentId: reelId,
    authorId: toObjectId(creatorId),
    text: `${title}\n${input.caption ?? ""}\n${hashtags.map((h) => `#${h}`).join(" ")}`,
    mediaUrl: input.videoUrl,
    mediaProvided: true,
    trustedAuthor: true,
    excerpt: `${title}${input.caption ? ` — ${input.caption}` : ""}`,
  });

  const status = moderation.decision;
  await col<ReelDoc>(db, "reels").updateOne(
    { _id: reelId } as never,
    {
      $set: {
        moderationStatus: status,
        moderationReason: moderation.reason,
        moderationScore: moderation.score,
        moderationSource: moderation.source,
        moderationProvider: moderation.provider,
        moderationMediaAnalyzed: moderation.mediaAnalyzed,
        moderatedAt: new Date(),
        publishedAt: status === "approved" ? new Date() : null,
      },
    }
  );

  // Held or rejected media never reaches the public feed, so no publish
  // notification is sent. The creator is told the real outcome instead.
  if (status === "approved") {
    await notifyFollowersOfPublishedReel(db, reelId, creatorId, title);
  } else if (moderation.needsManualReview) {
    await createNotification(db, {
      recipientId: creatorId,
      type: "content_moderation",
      title:
        status === "rejected"
          ? "Reel not published"
          : "Reel submitted for review",
      message:
        status === "rejected"
          ? `Your reel "${title}" was not published. ${moderation.reason ?? ""}`.trim()
          : `Your reel "${title}" is awaiting moderator review.`,
      data: { content_type: "reel", content_id: reelId.toHexString() },
    });
  }

  return { ok: true, reelId, moderationStatus: status };
}

async function notifyFollowersOfPublishedReel(
  db: Db,
  reelId: ObjectId,
  creatorId: string | ObjectId,
  title: string
) {
  const followers = await col(db, "follows")
    .find({ followingId: toObjectId(creatorId) } as never)
    .project({ followerId: 1 })
    .limit(500)
    .toArray();
  for (const f of followers) {
    if (f.followerId.equals(toObjectId(creatorId))) continue;
    await createNotification(db, {
      recipientId: f.followerId,
      actorId: creatorId,
      type: "content_published",
      title: "New reel",
      message: `published "${title}"`,
      data: { reel_id: reelId.toHexString() },
    });
  }
}

export interface ListReelsOptions {
  limit?: number;
  category?: string;
  creatorId?: string | ObjectId;
  /** Include the creator's own non-approved reels (owner view). */
  includeOwnPending?: string | ObjectId;
  /** Stable keyset pagination: { createdAt, _id } of the last item. */
  before?: { createdAt: Date; id: string } | null;
  sort?: "new" | "popular";
}

/**
 * Approved-only feed with stable ordering and keyset pagination.
 * `$lt` on (createdAt, _id) prevents duplicates and skipped rows when many
 * reels share a timestamp.
 */
export async function listReels(db: Db, opts: ListReelsOptions = {}) {
  const limit = safeLimit(opts.limit, 12, 8);
  const filter: Record<string, unknown> = {};
  if (opts.category) filter.category = opts.category;
  if (opts.creatorId) filter.creatorId = toObjectId(opts.creatorId);

  const ownPending = opts.includeOwnPending ? toObjectId(opts.includeOwnPending) : null;
  // Reels are new, so there is no legacy data to grandfather; anything not
  // explicitly approved stays out of the public feed.
  filter.$or = ownPending
    ? [{ moderationStatus: "approved" }, { creatorId: ownPending }]
    : [{ moderationStatus: "approved" }];

  if (opts.before) {
    const beforeId = toObjectId(opts.before.id);
    filter.$and = [
      {
        $or: [
          { createdAt: { $lt: opts.before.createdAt } },
          { createdAt: opts.before.createdAt, _id: { $lt: beforeId } },
        ],
      },
    ];
  }

  const sort = opts.sort === "popular" ? { likeCount: -1, _id: -1 } : { createdAt: -1, _id: -1 };

  const rows = await col<ReelDoc>(db, "reels")
    .find(filter as never)
    .sort(sort as never)
    .limit(limit)
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.creatorId));
  return serializeMany(
    rows.map((r) => ({
      ...r,
      creator: authors.get(r.creatorId.toHexString()) ?? null,
    }))
  );
}

export async function getReel(
  db: Db,
  id: string | ObjectId,
  viewerId?: string | ObjectId
) {
  const row = await col<ReelDoc>(db, "reels").findOne({ _id: toObjectId(id) } as never);
  if (!row) return null;
  // Non-approved reels are visible only to their owner and to moderation roles
  // (visibility decided by the caller; this helper returns the raw row).
  const authors = await resolveAuthors(db, [row.creatorId]);
  const enriched = serialize({
    ...row,
    creator: authors.get(row.creatorId.toHexString()) ?? null,
  }) as unknown as Record<string, unknown>;
  if (viewerId) {
    const liked = await col(db, "reactions").findOne({
      userId: toObjectId(viewerId),
      targetType: "reel",
      targetId: row._id,
      kind: "like",
    } as never);
    enriched.likedByViewer = !!liked;
  }
  return enriched;
}

/** Current UTC hour bucket used for the once-per-hour view throttle. */
function hourBucket(at: Date = new Date()): number {
  return Math.floor(at.getTime() / 3_600_000);
}

/**
 * Record a view, throttled to one counted view per user per hour.
 *
 * The throttle is enforced by a unique (reelId, userId, hourBucket) index, so
 * concurrent duplicate requests collide on the key and only one of them can
 * increment the counter.
 */
export async function recordReelView(
  db: Db,
  reelId: string | ObjectId,
  userId: string | ObjectId
) {
  const rid = toObjectId(reelId);
  const uid = toObjectId(userId);
  const reel = await col<ReelDoc>(db, "reels").findOne({ _id: rid } as never);
  if (!reel) return { ok: false as const, reason: "not_found" as const };

  try {
    await col<ReelViewDoc>(db, "reelViews").insertOne({
      reelId: rid,
      userId: uid,
      watchedSeconds: 0,
      hourBucket: hourBucket(),
      createdAt: new Date(),
    } as never);
  } catch (err: unknown) {
    if (err instanceof Error && /duplicate key/i.test(err.message)) {
      return { ok: true as const, viewCount: reel.viewCount, throttled: true as const };
    }
    throw err;
  }

  const updated = await col<ReelDoc>(db, "reels").findOneAndUpdate(
    { _id: rid } as never,
    { $inc: { viewCount: 1 } },
    { returnDocument: "after" }
  );
  return { ok: true as const, viewCount: updated?.viewCount ?? reel.viewCount + 1 };
}

/**
 * Idempotent like.
 *
 * A toggle is ambiguous under concurrency: eight taps that each read "not liked"
 * and then each insert would either create eight reactions (if the row is
 * missing) or eight duplicate-key errors, and a counter incremented per caller
 * drifts away from the real number of reaction rows.
 *
 * The write is therefore expressed as a DESIRED STATE and the denormalised
 * counter is moved only when the reaction row genuinely changed
 * (`upsertedCount === 1` / `deletedCount === 1`). Concurrent duplicate taps
 * therefore converge on exactly one reaction row and exactly one increment, and
 * the counter is clamped at zero.
 */
export async function setReelLike(
  db: Db,
  reelId: string | ObjectId,
  userId: string | ObjectId,
  liked: boolean
): Promise<{ ok: boolean; liked: boolean; likeCount: number; reason?: "not_found" }> {
  const rid = toObjectId(reelId);
  const uid = toObjectId(userId);

  const now = () => new Date();
  if (liked) {
    const insert = await col(db, "reactions").updateOne(
      { userId: uid, targetType: "reel", targetId: rid, kind: "like" } as never,
      { $setOnInsert: { userId: uid, targetType: "reel", targetId: rid, kind: "like", createdAt: now() } } as never,
      { upsert: true }
    );
    if (insert.upsertedCount === 1) {
      const updated = await col<ReelDoc>(db, "reels").findOneAndUpdate(
        { _id: rid } as never,
        { $inc: { likeCount: 1 } },
        { returnDocument: "after" }
      );
      if (!updated) return { ok: false, liked: false, likeCount: 0, reason: "not_found" };
      // A concurrent un-like may have removed the row again between the upsert
      // and the increment, so the counter is reconciled against the
      // authoritative rows before it is reported.
      return { ok: true, liked: true, likeCount: await reconcileReelLikeCount(db, rid) };
    }
    // Already liked: repair any counter drift and report the true state.
    const count = await reconcileReelLikeCount(db, rid);
    return { ok: true, liked: true, likeCount: count };
  }

  const deleted = await col(db, "reactions").deleteOne({
    userId: uid,
    targetType: "reel",
    targetId: rid,
    kind: "like",
  } as never);
  if (deleted.deletedCount === 1) {
    const updated = await col<ReelDoc>(db, "reels").findOneAndUpdate(
      { _id: rid } as never,
      { $inc: { likeCount: -1 } },
      { returnDocument: "after" }
    );
    if (!updated) return { ok: false, liked: false, likeCount: 0, reason: "not_found" };
    const count = await reconcileReelLikeCount(db, rid);
    return { ok: true, liked: false, likeCount: count };
  }
  const count = await reconcileReelLikeCount(db, rid);
  return { ok: true, liked: false, likeCount: count };
}

/**
 * Realign the denormalised like counter with the authoritative reaction rows.
 *
 * Every mutation path ends here, so whichever toggle commits last writes the
 * true count and concurrent inserts/deletes cannot leave the counter drifting.
 */
async function reconcileReelLikeCount(db: Db, rid: ObjectId): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const count = await countReelLikes(db, rid);
    const stored = await col<ReelDoc>(db, "reels").findOne({ _id: rid } as never, {
      projection: { likeCount: 1 },
    });
    const current = Number(stored?.likeCount ?? 0);
    if (current === count) return count;
    await syncReelLikeCount(db, rid, count);
  }
  return Math.max(0, await countReelLikes(db, rid));
}

async function countReelLikes(db: Db, rid: ObjectId): Promise<number> {
  return col(db, "reactions").countDocuments({
    targetType: "reel",
    targetId: rid,
    kind: "like",
  } as never);
}

/** Realigns the denormalised counter with the authoritative reaction rows. */
async function syncReelLikeCount(db: Db, rid: ObjectId, count: number): Promise<void> {
  await col<ReelDoc>(db, "reels").updateOne(
    { _id: rid } as never,
    { $set: { likeCount: Math.max(0, count) } }
  );
}

/**
 * Convenience wrapper used by the API layer: resolves the caller's current state
 * and applies the corresponding desired state.
 */
export async function toggleReelLike(
  db: Db,
  reelId: string | ObjectId,
  userId: string | ObjectId
): Promise<{ ok: boolean; liked: boolean; likeCount: number; reason?: "not_found" }> {
  const rid = toObjectId(reelId);
  const uid = toObjectId(userId);
  const reel = await col<ReelDoc>(db, "reels").findOne({ _id: rid } as never);
  if (!reel) return { ok: false, liked: false, likeCount: 0, reason: "not_found" };

  const existing = await col(db, "reactions").findOne({
    userId: uid,
    targetType: "reel",
    targetId: rid,
    kind: "like",
  } as never);

  return setReelLike(db, rid, uid, !existing);
}

/**
 * Save / unsave a reel, keeping the denormalised `saveCount` honest.
 *
 * Mirrors `setReelLike`: the counter only moves when the underlying
 * `savedReels` row actually appears or disappears, so repeated calls (including
 * concurrent ones, protected by the unique userId+reelId index) converge
 * instead of inflating the count.
 */
export async function setReelSave(
  db: Db,
  reelId: string | ObjectId,
  userId: string | ObjectId,
  saved: boolean
): Promise<{ ok: boolean; saved: boolean; saveCount: number; reason?: "not_found" }> {
  const rid = toObjectId(reelId);
  const uid = toObjectId(userId);
  const reel = await col<ReelDoc>(db, "reels").findOne({ _id: rid } as never);
  if (!reel) return { ok: false, saved: false, saveCount: 0, reason: "not_found" };

  if (saved) {
    const insert = await col(db, "savedReels").updateOne(
      { userId: uid, reelId: rid } as never,
      { $setOnInsert: { userId: uid, reelId: rid, createdAt: new Date() } } as never,
      { upsert: true }
    );
    if (insert.upsertedCount === 1) {
      await col<ReelDoc>(db, "reels").updateOne(
        { _id: rid } as never,
        { $inc: { saveCount: 1 } }
      );
      return { ok: true, saved: true, saveCount: await reconcileReelSaveCount(db, rid) };
    }
    const count = await reconcileReelSaveCount(db, rid);
    return { ok: true, saved: true, saveCount: count };
  }

  const deleted = await col(db, "savedReels").deleteMany({ userId: uid, reelId: rid } as never);
  if (deleted.deletedCount > 0) {
    await col<ReelDoc>(db, "reels").updateOne(
      { _id: rid } as never,
      { $inc: { saveCount: -deleted.deletedCount } }
    );
    return { ok: true, saved: false, saveCount: await reconcileReelSaveCount(db, rid) };
  }
  const count = await reconcileReelSaveCount(db, rid);
  return { ok: true, saved: false, saveCount: count };
}

/** Same contract as `reconcileReelLikeCount`, for the save counter. */
async function reconcileReelSaveCount(db: Db, rid: ObjectId): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const count = await countReelSaves(db, rid);
    const stored = await col<ReelDoc>(db, "reels").findOne({ _id: rid } as never, {
      projection: { saveCount: 1 },
    });
    if (Number(stored?.saveCount ?? 0) === count) return count;
    await syncReelSaveCount(db, rid, count);
  }
  return Math.max(0, await countReelSaves(db, rid));
}

async function countReelSaves(db: Db, rid: ObjectId): Promise<number> {
  return col(db, "savedReels").countDocuments({ reelId: rid } as never);
}

async function syncReelSaveCount(db: Db, rid: ObjectId, count: number): Promise<void> {
  await col<ReelDoc>(db, "reels").updateOne(
    { _id: rid } as never,
    { $set: { saveCount: Math.max(0, count) } }
  );
}

/** Atomic share counter (idempotent from the caller's perspective). */
export async function recordReelShare(db: Db, reelId: string | ObjectId) {
  const updated = await col<ReelDoc>(db, "reels").findOneAndUpdate(
    { _id: toObjectId(reelId) } as never,
    { $inc: { shareCount: 1 } },
    { returnDocument: "after" }
  );
  return updated?.shareCount ?? null;
}

export async function deleteReel(
  db: Db,
  id: string | ObjectId,
  actorId: string | ObjectId,
  actorRole: string
) {
  const row = await col<ReelDoc>(db, "reels").findOne({ _id: toObjectId(id) } as never);
  if (!row) return { ok: false as const, reason: "not_found" as const };
  const owns = row.creatorId.equals(toObjectId(actorId));
  if (!owns && actorRole !== "admin" && actorRole !== "super_admin") {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const rid = row._id;
  await col<ReelDoc>(db, "reels").deleteOne({ _id: rid } as never);
  await col<ReelViewDoc>(db, "reelViews").deleteMany({ reelId: rid } as never);
  await col(db, "reactions").deleteMany({ targetType: "reel", targetId: rid } as never);
  await col(db, "savedReels").deleteMany({ reelId: rid } as never);
  await col(db, "reports").deleteMany({ targetType: "reel", targetId: rid } as never);
  await col(db, "notifications").deleteMany({ "data.reel_id": rid.toHexString() } as never);
  await col(db, "moderationReviews").deleteMany({ contentType: "reel", contentId: rid } as never);
  return { ok: true as const };
}

export async function listReelCategories(db: Db): Promise<string[]> {
  const rows = await col<ReelDoc>(db, "reels")
    .distinct("category", { moderationStatus: "approved" } as never)
    .catch(() => [] as unknown[]);
  return (rows as unknown[])
    .filter((c): c is string => typeof c === "string" && c.length > 0)
    .sort((a, b) => a.localeCompare(b));
}
