import { Db, ObjectId } from "mongodb";
import { col, type PostDoc, type MediaItem } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serialize, serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";

export interface CreatePostInput {
  authorId: string | ObjectId;
  content?: string | null;
  media?: MediaItem[];
}

/** Create a post. Requires text or at least one media item. */
export async function createPost(db: Db, input: CreatePostInput) {
  const content = input.content?.trim() || null;
  const media = input.media ?? [];
  if (!content && media.length === 0) {
    return { ok: false as const, reason: "empty" as const };
  }
  if (media.length > 4) {
    return { ok: false as const, reason: "too_many_media" as const };
  }
  const now = new Date();
  const res = await col<PostDoc>(db, "posts").insertOne({
    authorId: toObjectId(input.authorId),
    content,
    media,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as never);
  return { ok: true as const, postId: res.insertedId };
}

export interface PostFilter {
  authorId?: string | ObjectId;
  authorIds?: Array<string | ObjectId>;
  before?: Date;
  limit?: number;
}

/** Paginated feed (newest first, excludes soft-deleted). */
export async function listPosts(db: Db, filter: PostFilter = {}) {
  const limit = safeLimit(filter.limit, 50);
  const query: Record<string, unknown> = { deletedAt: null };
  if (filter.authorId) query.authorId = toObjectId(filter.authorId);
  if (filter.authorIds) query.authorId = { $in: filter.authorIds.map((a) => toObjectId(a)) };
  if (filter.before) query.createdAt = { $lt: filter.before };
  const rows = await col<PostDoc>(db, "posts")
    .find(query as never)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  const withCounts = await attachCounts(db, rows);
  const authors = await resolveAuthors(db, withCounts.map((p) => p.authorId));
  return serializeMany(
    withCounts.map((p) => ({
      ...p,
      author: authors.get(p.authorId.toHexString()) ?? null,
    }))
  );
}

/** Fetch specific posts by id (soft-deleted excluded), preserving input order. */
export async function getPostsByIds(db: Db, ids: Array<string | ObjectId>) {
  const oids = ids.map((id) => toObjectId(id));
  if (oids.length === 0) return [];
  const rows = await col<PostDoc>(db, "posts")
    .find({ _id: { $in: oids }, deletedAt: null } as never)
    .toArray();
  const withCounts = await attachCounts(db, rows);
  const authors = await resolveAuthors(
    db,
    withCounts.map((p) => p.authorId)
  );
  const order = new Map(oids.map((id, i) => [id.toHexString(), i]));
  return serializeMany(
    withCounts.map((p) => ({
      ...p,
      author: authors.get(p.authorId.toHexString()) ?? null,
    }))
  ).sort(
    (a, b) =>
      (order.get(String((a as unknown as Record<string, unknown>).id)) ?? 0) -
      (order.get(String((b as unknown as Record<string, unknown>).id)) ?? 0)
  );
}

export async function getPost(db: Db, id: string | ObjectId) {  const row = await col<PostDoc>(db, "posts").findOne({
    _id: toObjectId(id),
    deletedAt: null,
  } as never);
  if (!row) return null;
  const [withCounts] = await attachCounts(db, [row]);
  const authors = await resolveAuthors(db, [withCounts.authorId]);
  return serialize({
    ...withCounts,
    author: authors.get(withCounts.authorId.toHexString()) ?? null,
  });
}

/** Soft-delete an owned post. Returns false when missing or not owned. */
export async function deleteOwnPost(db: Db, id: string | ObjectId, authorId: string | ObjectId) {
  const res = await col<PostDoc>(db, "posts").updateOne(
    { _id: toObjectId(id), authorId: toObjectId(authorId), deletedAt: null } as never,
    { $set: { deletedAt: new Date(), updatedAt: new Date() } }
  );
  return res.matchedCount === 1;
}

/** Soft-delete for moderation (admin/moderator path, authorization checked by caller). */
export async function removePost(db: Db, id: string | ObjectId) {
  const res = await col<PostDoc>(db, "posts").updateOne(
    { _id: toObjectId(id) } as never,
    { $set: { deletedAt: new Date(), updatedAt: new Date() } }
  );
  return res.matchedCount === 1;
}

async function attachCounts(db: Db, rows: PostDoc[]) {
  if (rows.length === 0) return rows.map((r) => ({ ...r, reactionCount: 0, commentCount: 0 }));
  const ids = rows.map((r) => r._id);
  const [reactions, comments] = await Promise.all([
    col(db, "reactions")
      .aggregate([
        { $match: { targetType: "post", targetId: { $in: ids } } },
        { $group: { _id: "$targetId", n: { $sum: 1 } } },
      ])
      .toArray(),
    col(db, "comments")
      .aggregate([
        { $match: { postId: { $in: ids }, deletedAt: null } },
        { $group: { _id: "$postId", n: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const rMap = new Map(reactions.map((r) => [String(r._id), r.n as number]));
  const cMap = new Map(comments.map((r) => [String(r._id), r.n as number]));
  return rows.map((r) => ({
    ...r,
    reactionCount: rMap.get(r._id.toHexString()) ?? 0,
    commentCount: cMap.get(r._id.toHexString()) ?? 0,
  }));
}
