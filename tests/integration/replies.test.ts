import { describe, expect, it, beforeAll, afterEach } from "vitest";
// Isolate this file's data: every integration file uses its own database
// (workers share one memory server, so shared names would flake).
process.env.MONGODB_DB = "dyne_test_replies";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser } from "@/lib/db/users";
import { createPost } from "@/lib/db/posts";
import { createComment, listComments, listReplies, deleteComment } from "@/lib/db/comments";

async function makeUser(username: string) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  return r.userId;
}

describe("comment replies (single-level threading)", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("creates replies, lists them per parent, and counts them on the parent", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const post = await createPost(db, { authorId: alice, content: "post" });
    if (!post.ok) throw new Error("setup failed");

    const top = await createComment(db, post.postId, bob, "Top-level");
    if (!top.ok) throw new Error("setup failed");

    const r1 = await createComment(db, post.postId, alice, "Reply one", top.commentId);
    const r2 = await createComment(db, post.postId, bob, "Reply two", top.commentId);
    if (!r1.ok || !r2.ok) throw new Error("setup failed");

    // Top-level listing stays flat but carries the reply count.
    const listed = await listComments(db, post.postId);
    expect(listed).toHaveLength(1);
    expect((listed[0] as Record<string, unknown>).replyCount).toBe(2);

    const replies = await listReplies(db, post.postId, top.commentId);
    expect(replies).not.toBeNull();
    expect(replies!).toHaveLength(2);
    expect((replies![0] as Record<string, unknown>).content).toBe("Reply one");

    // Unknown parent or cross-post parent resolves to null (route maps to 404).
    const other = await createPost(db, { authorId: alice, content: "other" });
    if (!other.ok) throw new Error("setup failed");
    expect(await listReplies(db, other.postId, top.commentId)).toBeNull();
  });

  it("rejects replies to replies (depth guard) and bad parents", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    const post = await createPost(db, { authorId: alice, content: "post" });
    if (!post.ok) throw new Error("setup failed");

    const top = await createComment(db, post.postId, alice, "Top");
    if (!top.ok) throw new Error("setup failed");
    const reply = await createComment(db, post.postId, alice, "Reply", top.commentId);
    if (!reply.ok) throw new Error("setup failed");

    // Reply-to-reply is rejected.
    expect(await createComment(db, post.postId, alice, "Too deep", reply.commentId)).toEqual({
      ok: false, reason: "bad_parent",
    });

    // Deleting the parent hides its thread from the top-level list.
    expect(await deleteComment(db, top.commentId, alice, false)).toBe(true);
    expect(await listComments(db, post.postId)).toHaveLength(0);
    expect(await listReplies(db, post.postId, top.commentId)).toBeNull();
  });
});
