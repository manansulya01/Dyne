import { Db, ObjectId } from "mongodb";
import { col, type VideoDoc, type VideoViewDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serialize, serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";

/** Media URLs must be app-served (/api/files/…) or absolute http(s) — never javascript:/data:. */
export function isSafeMediaUrl(value: unknown, maxLength = 2000): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    (value.startsWith("/api/files/") || /^https?:\/\/.+/i.test(value))
  );
}

export async function createVideo(
  db: Db,
  creatorId: string | ObjectId,
  input: {
    title: string;
    description?: string | null;
    videoUrl: string;
    thumbnailUrl?: string | null;
    category?: string | null;
    duration?: number | null;
  }
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
  const res = await col<VideoDoc>(db, "videos").insertOne({
    title: input.title.trim(),
    description: input.description?.trim() || null,
    videoUrl: input.videoUrl,
    thumbnailUrl: input.thumbnailUrl ?? null,
    creatorId: toObjectId(creatorId),
    duration: input.duration ?? null,
    viewCount: 0,
    category: input.category?.trim() || null,
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, videoId: res.insertedId };
}

export async function listVideos(
  db: Db,
  opts: { limit?: number; category?: string; mine?: string | ObjectId; sort?: "new" | "popular"; cursor?: string | null } = {}
) {
  const limit = safeLimit(opts.limit, 50);
  const filter: Record<string, unknown> = {};
  if (opts.category) filter.category = opts.category;
  if (opts.mine) filter.creatorId = toObjectId(opts.mine);
  const popular = opts.sort === "popular";
  if (opts.cursor) {
    if (popular) {
      const n = Number(opts.cursor);
      if (!Number.isNaN(n)) filter.viewCount = { $lt: n };
    } else {
      const parsed = new Date(opts.cursor);
      if (!isNaN(+parsed)) filter.createdAt = { $lt: parsed };
    }
  }
  const sort = popular ? { viewCount: -1 } : { createdAt: -1 };
  const rows = await col<VideoDoc>(db, "videos")
    .find(filter as never)
    .sort(sort as never)
    .limit(limit)
    .toArray();
  const authors = await resolveAuthors(db, rows.map((v) => v.creatorId));
  return serializeMany(
    rows.map((v) => ({ ...v, creator: authors.get(v.creatorId.toHexString()) ?? null }))
  );
}

export async function getVideo(db: Db, id: string | ObjectId) {
  const row = await col<VideoDoc>(db, "videos").findOne({ _id: toObjectId(id) } as never);
  if (!row) return null;
  const authors = await resolveAuthors(db, [row.creatorId]);
  return serialize({
    ...row,
    creator: authors.get(row.creatorId.toHexString()) ?? null,
  });
}

/**
 * Record a view, throttled to one counted view per user per hour.
 * Returns the (possibly unchanged) view count.
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

export async function deleteVideo(
  db: Db,
  id: string | ObjectId,
  actorId: string | ObjectId,
  actorRole: string
) {
  const row = await col<VideoDoc>(db, "videos").findOne({ _id: toObjectId(id) } as never);
  if (!row) return { ok: false as const, reason: "not_found" as const };
  if (!row.creatorId.equals(toObjectId(actorId)) && actorRole !== "admin") {
    return { ok: false as const, reason: "forbidden" as const };
  }
  await col<VideoDoc>(db, "videos").deleteOne({ _id: row._id } as never);
  await col<VideoViewDoc>(db, "videoViews").deleteMany({ videoId: row._id } as never);
  return { ok: true as const };
}
