import { Db, ObjectId } from "mongodb";
import { col, type VideoDoc, type VideoViewDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serialize, serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";
import { moderateContent } from "@/lib/moderation";
import { createNotification } from "./notifications";

/**
 * Horizontal / landscape video repository (Dyne Videos).
 *
 * Extends the original Watch model rather than replacing it: existing rows
 * remain readable (`orientation` falls back to "horizontal"). Reels live in
 * their own collection so the two experiences never blur together.
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

export interface CreateVideoInput {
  title: string;
  description?: string | null;
  videoUrl: string;
  thumbnailUrl?: string | null;
  category?: string | null;
  duration?: number | null;
  /** Uploaded pixel dimensions (used for orientation/aspect hints). */
  width?: number | null;
  height?: number | null;
}

export async function createVideo(
  db: Db,
  creatorId: string | ObjectId,
  input: CreateVideoInput
) {
  if (input.title.trim().length < 3 || input.title.length > 200) {
    return { ok: false as const, reason: "bad_title" as const };
  }
  if (!isSafeMediaUrl(input.videoUrl)) {
    return { ok: false as const, reason: "bad_url" as const };
  }
  if (input.thumbnailUrl != null && !isSafeMediaUrl(input.thumbnailUrl)) {
    return { ok: false as const, reason: "bad_thumbnail" as const };
  }
  const now = new Date();
  const orientation: "horizontal" | "vertical" =
    input.width && input.height && input.height > input.width ? "vertical" : "horizontal";
  const aspectRatio =
    input.width && input.height ? `${input.width}:${input.height}` : null;

  const res = await col<VideoDoc>(db, "videos").insertOne({
    title: input.title.trim(),
    description: input.description?.trim() || null,
    videoUrl: input.videoUrl,
    thumbnailUrl: input.thumbnailUrl ?? null,
    creatorId: toObjectId(creatorId),
    duration: input.duration ?? null,
    viewCount: 0,
    category: input.category?.trim() || null,
    orientation,
    aspectRatio,
    moderationStatus: "pending",
    moderationReason: null,
    moderationScore: null,
    moderationSource: null,
    moderationProvider: null,
    moderationMediaAnalyzed: false,
    moderatedAt: now,
    createdAt: now,
    updatedAt: now,
  } as never);

  const videoId = res.insertedId;
  const moderation = await moderateContent(db, {
    contentType: "video",
    contentId: videoId,
    authorId: toObjectId(creatorId),
    text: `${input.title}\n${input.description ?? ""}`,
    mediaUrl: input.videoUrl,
    mediaProvided: true,
    trustedAuthor: true,
    excerpt: `${input.title}${input.description ? ` — ${input.description}` : ""}`,
  });

  const status = moderation.decision;
  await col<VideoDoc>(db, "videos").updateOne(
    { _id: videoId } as never,
    {
      $set: {
        moderationStatus: status,
        moderationReason: moderation.reason,
        moderationScore: moderation.score,
        moderationSource: moderation.source,
        moderationProvider: moderation.provider,
        moderationMediaAnalyzed: moderation.mediaAnalyzed,
        moderatedAt: new Date(),
      },
    }
  );

  if (moderation.needsManualReview || status === "rejected") {
    await createNotification(db, {
      recipientId: creatorId,
      type: "content_moderation",
      title: status === "rejected" ? "Video not published" : "Video submitted for review",
      message:
        status === "rejected"
          ? `Your video "${input.title}" was not published. ${moderation.reason ?? ""}`.trim()
          : `Your video "${input.title}" is awaiting moderator review.`,
      data: { content_type: "video", content_id: videoId.toHexString() },
    });
  }

  return { ok: true as const, videoId, moderationStatus: status };
}

export interface ListVideosOptions {
  limit?: number;
  category?: string;
  creatorId?: string | ObjectId;
  sort?: "new" | "popular";
  /** Keyset cursor (createdAt ISO) — stable ordering with `_id` tiebreak. */
  before?: { createdAt: Date; id: string } | null;
  search?: string;
  /** Owner scope: show this creator's non-approved rows too. */
  includeOwnPending?: string | ObjectId;
  /** Legacy "popular" cursor: only videos with fewer views than this. */
  maxViews?: number | null;
}

export async function listVideos(db: Db, opts: ListVideosOptions = {}) {
  const limit = safeLimit(opts.limit, 24, 12);
  const filter: Record<string, unknown> = {};
  if (opts.category) filter.category = opts.category;
  if (opts.creatorId) filter.creatorId = toObjectId(opts.creatorId);
  if (opts.search) {
    const rx = { $regex: opts.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ title: rx }, { description: rx }];
  }

  const ownPending = opts.includeOwnPending ? toObjectId(opts.includeOwnPending) : null;
  // Legacy rows predate moderation metadata: treat a missing status as
  // approved rather than silently hiding existing content.
  const approvedClauses = [
    { moderationStatus: "approved" },
    { moderationStatus: { $exists: false } },
  ];
  const visible = ownPending
    ? { $or: [...approvedClauses, { creatorId: ownPending }] }
    : { $or: approvedClauses };
  // Merge with any existing $or (search) using $and so neither is lost.
  if (filter.$or) {
    const searchOr = filter.$or;
    delete filter.$or;
    filter.$and = [visible, { $or: searchOr }];
  } else {
    Object.assign(filter, visible);
  }

  if (opts.before) {
    const cursorClause = opts.before.id
      ? {
          $or: [
            { createdAt: { $lt: opts.before.createdAt } },
            { createdAt: opts.before.createdAt, _id: { $lt: toObjectId(opts.before.id) } },
          ],
        }
      : { createdAt: { $lt: opts.before.createdAt } };
    filter.$and = [...((filter.$and as unknown[]) ?? []), cursorClause];
  }
  if (typeof opts.maxViews === "number" && Number.isFinite(opts.maxViews)) {
    filter.viewCount = { $lt: opts.maxViews };
  }

  const popular = opts.sort === "popular";
  const sort = popular ? { viewCount: -1, _id: -1 } : { createdAt: -1, _id: -1 };

  const rows = await col<VideoDoc>(db, "videos")
    .find(filter as never)
    .sort(sort as never)
    .limit(limit)
    .toArray();
  const authors = await resolveAuthors(db, rows.map((v) => v.creatorId));
  const likes = await countVideoLikes(db, rows.map((v) => v._id));
  return serializeMany(
    rows.map((v) => ({
      ...v,
      likeCount: likes.get(v._id.toHexString()) ?? 0,
      saveCount: 0,
      commentCount: 0,
      creator: authors.get(v.creatorId.toHexString()) ?? null,
    }))
  );
}

async function countVideoLikes(db: Db, videoIds: ObjectId[]): Promise<Map<string, number>> {
  if (videoIds.length === 0) return new Map();
  const rows = await col(db, "reactions")
    .aggregate([
      { $match: { targetType: "video", targetId: { $in: videoIds } } },
      { $group: { _id: "$targetId", count: { $sum: 1 } } },
    ] as never)
    .toArray();
  return new Map(
    rows.map((r) => [
      String((r as { _id: unknown })._id),
      Number((r as { count: number }).count ?? 0),
    ])
  );
}

export async function getVideo(
  db: Db,
  id: string | ObjectId,
  viewerId?: string | ObjectId
) {
  const row = await col<VideoDoc>(db, "videos").findOne({ _id: toObjectId(id) } as never);
  if (!row) return null;
  const authors = await resolveAuthors(db, [row.creatorId]);
  const likes = await countVideoLikes(db, [row._id]);
  const enriched = serialize({
    ...row,
    likeCount: likes.get(row._id.toHexString()) ?? 0,
    creator: authors.get(row.creatorId.toHexString()) ?? null,
  }) as unknown as Record<string, unknown>;
  if (viewerId) {
    const liked = await col(db, "reactions").findOne({
      userId: toObjectId(viewerId),
      targetType: "video",
      targetId: row._id,
      kind: "like",
    } as never);
    enriched.likedByViewer = !!liked;
  }
  return enriched;
}

/**
 * Record a view, throttled to one counted view per user per hour.
 */
export async function recordVideoView(db: Db, videoId: string | ObjectId, userId: string | ObjectId) {
  const vid = toObjectId(videoId);
  const uid = toObjectId(userId);
  const video = await col<VideoDoc>(db, "videos").findOne({ _id: vid } as never);
  if (!video) return { ok: false as const, reason: "not_found" as const };
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await col<VideoViewDoc>(db, "videoViews").findOne({
    videoId: vid,
    userId: uid,
    createdAt: { $gte: cutoff },
  } as never);
  if (recent) return { ok: true as const, viewCount: video.viewCount, throttled: true as const };
  await col<VideoViewDoc>(db, "videoViews").insertOne({
    videoId: vid,
    userId: uid,
    watchedDuration: 0,
    createdAt: new Date(),
  } as never);
  const updated = await col<VideoDoc>(db, "videos").findOneAndUpdate(
    { _id: vid } as never,
    { $inc: { viewCount: 1 } },
    { returnDocument: "after" }
  );
  return { ok: true as const, viewCount: updated?.viewCount ?? video.viewCount + 1 };
}

/** Atomic like toggle for horizontal videos (race-safe). */
export async function toggleVideoLike(
  db: Db,
  videoId: string | ObjectId,
  userId: string | ObjectId
): Promise<{ ok: boolean; liked: boolean; likeCount: number; reason?: "not_found" }> {
  const vid = toObjectId(videoId);
  const uid = toObjectId(userId);
  const video = await col<VideoDoc>(db, "videos").findOne({ _id: vid } as never);
  if (!video) return { ok: false, liked: false, likeCount: 0, reason: "not_found" };

  const existing = await col(db, "reactions").findOne({
    userId: uid,
    targetType: "video",
    targetId: vid,
    kind: "like",
  } as never);
  if (existing) {
    await col(db, "reactions").deleteOne({ _id: existing._id } as never);
  } else {
    try {
      await col(db, "reactions").insertOne({
        userId: uid,
        targetType: "video",
        targetId: vid,
        kind: "like",
        createdAt: new Date(),
      } as never);
    } catch (err: unknown) {
      if (err instanceof Error && /duplicate key/i.test(err.message)) {
        const count = await col(db, "reactions").countDocuments({
          targetType: "video",
          targetId: vid,
        } as never);
        return { ok: true, liked: true, likeCount: count };
      }
      throw err;
    }
  }
  const count = await col(db, "reactions").countDocuments({
    targetType: "video",
    targetId: vid,
  } as never);
  return { ok: true, liked: !existing, likeCount: count };
}

export async function deleteVideo(
  db: Db,
  id: string | ObjectId,
  actorId: string | ObjectId,
  actorRole: string
) {
  const row = await col<VideoDoc>(db, "videos").findOne({ _id: toObjectId(id) } as never);
  if (!row) return { ok: false as const, reason: "not_found" as const };
  if (
    !row.creatorId.equals(toObjectId(actorId)) &&
    actorRole !== "admin" &&
    actorRole !== "super_admin"
  ) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const vid = row._id;
  await col<VideoDoc>(db, "videos").deleteOne({ _id: vid } as never);
  await col<VideoViewDoc>(db, "videoViews").deleteMany({ videoId: vid } as never);
  // Clean up dependent rows so deleted videos leave no dangling reactions,
  // saves, reports, notifications or moderation reviews behind.
  await col(db, "reactions").deleteMany({ targetType: "video", targetId: vid } as never);
  await col(db, "reports").deleteMany({ targetType: "video", targetId: vid } as never);
  await col(db, "notifications").deleteMany({ "data.video_id": vid.toHexString() } as never);
  await col(db, "moderationReviews").deleteMany({ contentType: "video", contentId: vid } as never);
  return { ok: true as const };
}

/** All distinct video categories (for filter chips). */
export async function listVideoCategories(db: Db): Promise<string[]> {
  const rows = await col<VideoDoc>(db, "videos")
    .distinct("category", { moderationStatus: "approved" } as never)
    .catch(() => [] as unknown[]);
  return (rows as unknown[])
    .filter((c): c is string => typeof c === "string" && c.length > 0)
    .sort((a, b) => a.localeCompare(b));
}
