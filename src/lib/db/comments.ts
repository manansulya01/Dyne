import { Db, ObjectId } from "mongodb";
import { col, type CommentDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";

export async function createComment(
  db: Db,
  postId: string | ObjectId,
  authorId: string | ObjectId,
  content: string,
  parentId?: string | ObjectId | null
) {
  const text = content.trim();
  if (!text) return { ok: false as const, reason: "empty" as const };
  if (text.length > 2000) return { ok: false as const, reason: "too_long" as const };
  const post = await col(db, "posts").findOne({
    _id: toObjectId(postId),
    deletedAt: null,
  } as never);
  if (!post) return { ok: false as const, reason: "post_not_found" as const };

  let parent: ObjectId | null = null;
  if (parentId) {
    parent = toObjectId(parentId);
    const parentRow = await col<CommentDoc>(db, "comments").findOne({
      _id: parent,
      postId: toObjectId(postId),
      deletedAt: null,
    } as never);
    if (!parentRow) return { ok: false as const, reason: "bad_parent" as const };
  }

  const now = new Date();
  const res = await col<CommentDoc>(db, "comments").insertOne({
    postId: toObjectId(postId),
    authorId: toObjectId(authorId),
    content: text,
    parentId: parent,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as never);
  return { ok: true as const, commentId: res.insertedId };
}

export async function listComments(db: Db, postId: string | ObjectId, limit = 20) {
  const rows = await col<CommentDoc>(db, "comments")
    .find({ postId: toObjectId(postId), parentId: null, deletedAt: null } as never)
    .sort({ createdAt: 1 })
    .limit(safeLimit(limit, 50))
    .toArray();
  const replyCounts = await countReplies(db, rows.map((r) => r._id));
  const authors = await resolveAuthors(db, rows.map((r) => r.authorId));
  return serializeMany(
    rows.map((r) => ({
      ...r,
      author: authors.get(r.authorId.toHexString()) ?? null,
      replyCount: replyCounts.get(r._id.toHexString()) ?? 0,
    }))
  );
}

async function countReplies(db: Db, ids: ObjectId[]) {
  if (ids.length === 0) return new Map<string, number>();
  const rows = await col(db, "comments")
    .aggregate([
      { $match: { parentId: { $in: ids }, deletedAt: null } },
      { $group: { _id: "$parentId", n: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [String(r._id), r.n as number]));
}

/** Soft-delete an owned comment (or any comment when moderator=true). */
export async function deleteComment(
  db: Db,
  id: string | ObjectId,
  authorId: string | ObjectId,
  moderator = false
) {
  const filter: Record<string, unknown> = { _id: toObjectId(id), deletedAt: null };
  if (!moderator) filter.authorId = toObjectId(authorId);
  const res = await col<CommentDoc>(db, "comments").updateOne(filter as never, {
    $set: { deletedAt: new Date(), updatedAt: new Date() },
  });
  return res.matchedCount === 1;
}
