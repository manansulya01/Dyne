import { Db, ObjectId } from "mongodb";
import { col, type StoryDoc, type StoryViewDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serialize, serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";
import { moderateContent } from "@/lib/moderation";
import { isSafeMediaUrl } from "./videos";

/**
 * Stories: ephemeral author posts with a hard expiry.
 *
 * Expiry is enforced three ways so a story can never become permanent by
 * accident: a TTL index removes the document, every read filters on
 * `expiresAt > now`, and reads of the media file 404 once expired.
 */

const MAX_LIFETIME_MS = 7 * 24 * 3600 * 1000;
const DEFAULT_LIFETIME_MS = 24 * 3600 * 1000;

export interface CreateStoryInput {
  mediaType: "image" | "video" | "text";
  mediaUrl?: string | null;
  text?: string | null;
  caption?: string | null;
  background?: string | null;
  /** Requested lifetime; clamped to [1h, 7d]. */
  lifetimeSeconds?: number;
}

export async function createStory(
  db: Db,
  authorId: string | ObjectId,
  input: CreateStoryInput
) {
  if (input.mediaType === "text") {
    const text = (input.text ?? "").trim();
    if (text.length < 1 || text.length > 1000) {
      return { ok: false as const, reason: "bad_text" as const };
    }
  } else {
    if (!isSafeMediaUrl(input.mediaUrl)) {
      return { ok: false as const, reason: "bad_url" as const };
    }
  }

  const requested = Math.max(
    60,
    Math.min(input.lifetimeSeconds ?? DEFAULT_LIFETIME_MS / 1000, MAX_LIFETIME_MS / 1000)
  );
  const now = new Date();
  const expiresAt = new Date(now.getTime() + requested * 1000);

  const res = await col<StoryDoc>(db, "stories").insertOne({
    authorId: toObjectId(authorId),
    mediaType: input.mediaType,
    mediaUrl: input.mediaUrl ?? null,
    thumbnailUrl: null,
    text: input.mediaType === "text" ? (input.text ?? "").trim() : null,
    background: input.background?.trim().slice(0, 50) || null,
    caption: input.caption?.trim().slice(0, 300) || null,
    expiresAt,
    viewCount: 0,
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

  const storyId = res.insertedId;
  const moderation = await moderateContent(db, {
    contentType: "story",
    contentId: storyId,
    authorId: toObjectId(authorId),
    text: `${input.mediaType === "text" ? input.text ?? "" : ""}\n${input.caption ?? ""}`.trim(),
    mediaUrl: input.mediaUrl ?? null,
    mediaProvided: input.mediaType !== "text",
    trustedAuthor: true,
    excerpt: (input.mediaType === "text" ? input.text ?? "" : input.caption ?? "") || "media story",
  });

  await col<StoryDoc>(db, "stories").updateOne(
    { _id: storyId } as never,
    {
      $set: {
        moderationStatus: moderation.decision,
        moderationReason: moderation.reason,
        moderationScore: moderation.score,
        moderationSource: moderation.source,
        moderationProvider: moderation.provider,
        moderationMediaAnalyzed: moderation.mediaAnalyzed,
        moderatedAt: new Date(),
      },
    }
  );

  return { ok: true as const, storyId, moderationStatus: moderation.decision };
}

/** Unexpired, approved stories grouped by author for the story tray. */
export async function listActiveStories(db: Db, opts: { limit?: number } = {}) {
  const now = new Date();
  const rows = await col<StoryDoc>(db, "stories")
    .find({ expiresAt: { $gt: now }, moderationStatus: "approved" } as never)
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit(opts.limit, 100, 50))
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.authorId));
  const stories = serializeMany(
    rows.map((r) => ({ ...r, author: authors.get(r.authorId.toHexString()) ?? null }))
  );
  // Group: newest-first per author.
  const byAuthor = new Map<string, { author: unknown; stories: typeof stories }>();
  for (const s of stories as unknown as Array<Record<string, unknown>>) {
    const key = String(s.authorId);
    const existing = byAuthor.get(key);
    if (existing) existing.stories.push(s as never);
    else
      byAuthor.set(key, {
        author: s.author,
        stories: [s as never],
      });
  }
  return { stories, groups: [...byAuthor.values()] };
}

export async function listStoriesByAuthor(
  db: Db,
  authorId: string | ObjectId,
  opts: { includePendingFor?: string | ObjectId; limit?: number } = {}
) {
  const now = new Date();
  const visibility: Record<string, unknown> =
    opts.includePendingFor && String(opts.includePendingFor) === String(authorId)
      ? { $or: [{ moderationStatus: "approved" }, { authorId: toObjectId(opts.includePendingFor) }] }
      : { moderationStatus: "approved" };
  const rows = await col<StoryDoc>(db, "stories")
    .find({ authorId: toObjectId(authorId), expiresAt: { $gt: now }, ...visibility } as never)
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit(opts.limit, 50))
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.authorId));
  return serializeMany(
    rows.map((r) => ({ ...r, author: authors.get(r.authorId.toHexString()) ?? null }))
  );
}

export async function getStory(db: Db, id: string | ObjectId) {
  const row = await col<StoryDoc>(db, "stories").findOne({ _id: toObjectId(id) } as never);
  if (!row) return null;
  // Expired stories are treated as gone even before the TTL sweep runs.
  if (row.expiresAt.getTime() <= Date.now()) return null;
  const authors = await resolveAuthors(db, [row.authorId]);
  return serialize({
    ...row,
    author: authors.get(row.authorId.toHexString()) ?? null,
  });
}

/** Idempotent view record (unique index on storyId+userId). */
export async function recordStoryView(
  db: Db,
  storyId: string | ObjectId,
  userId: string | ObjectId
) {
  const sid = toObjectId(storyId);
  const uid = toObjectId(userId);
  try {
    await col<StoryViewDoc>(db, "storyViews").insertOne({
      storyId: sid,
      userId: uid,
      createdAt: new Date(),
    } as never);
  } catch (err: unknown) {
    if (err instanceof Error && /duplicate key/i.test(err.message)) {
      const count = await col<StoryViewDoc>(db, "storyViews").countDocuments({
        storyId: sid,
      } as never);
      return { ok: true as const, viewCount: count, throttled: true as const };
    }
    throw err;
  }
  const updated = await col<StoryDoc>(db, "stories").findOneAndUpdate(
    { _id: sid } as never,
    { $inc: { viewCount: 1 } },
    { returnDocument: "after" }
  );
  return { ok: true as const, viewCount: updated?.viewCount ?? 1 };
}

export async function deleteStory(
  db: Db,
  id: string | ObjectId,
  actorId: string | ObjectId,
  actorRole: string
) {
  const row = await col<StoryDoc>(db, "stories").findOne({ _id: toObjectId(id) } as never);
  if (!row) return { ok: false as const, reason: "not_found" as const };
  if (
    !row.authorId.equals(toObjectId(actorId)) &&
    actorRole !== "admin" &&
    actorRole !== "super_admin"
  ) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  await col<StoryDoc>(db, "stories").deleteOne({ _id: row._id } as never);
  await col<StoryViewDoc>(db, "storyViews").deleteMany({ storyId: row._id } as never);
  await col(db, "reports").deleteMany({ targetType: "story", targetId: row._id } as never);
  await col(db, "moderationReviews").deleteMany({ contentType: "story", contentId: row._id } as never);
  return { ok: true as const };
}

/** Immediate removal of every expired story (also enforced by TTL index). */
export async function purgeExpiredStories(db: Db): Promise<number> {
  const res = await col<StoryDoc>(db, "stories").deleteMany({
    expiresAt: { $lte: new Date() },
  } as never);
  return res.deletedCount ?? 0;
}
