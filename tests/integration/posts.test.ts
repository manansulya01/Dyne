import { describe, expect, it, beforeAll, afterEach } from "vitest";
// Isolate this file's data: every integration file uses its own database
// (workers share one memory server, so shared names would flake).
process.env.MONGODB_DB = "dyne_test_posts";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser } from "@/lib/db/users";
import { createPost, listPosts, getPost, deleteOwnPost } from "@/lib/db/posts";
import { createComment, listComments, deleteComment } from "@/lib/db/comments";
import { toggleReaction, reactionState, savePost, unsavePost, isPostSaved } from "@/lib/db/reactions";

async function makeUser(username: string) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  return r.userId;
}

describe("posts + interactions", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("creates, lists with counts, and soft-deletes owned posts", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    expect(await createPost(db, { authorId: alice, content: "   " })).toEqual({ ok: false, reason: "empty" });

    const created = await createPost(db, { authorId: alice, content: "Hello campus" });
    if (!created.ok) throw new Error("setup failed");

    const feed = await listPosts(db, {});
    expect(feed).toHaveLength(1);
    expect((feed[0] as Record<string, unknown>).content).toBe("Hello campus");
    expect((feed[0] as Record<string, unknown>).reactionCount).toBe(0);

    const bob = await makeUser("bob");
    expect(await deleteOwnPost(db, created.postId, bob)).toBe(false);
    expect(await deleteOwnPost(db, created.postId, alice)).toBe(true);
    expect(await getPost(db, created.postId)).toBeNull();
    expect(await listPosts(db, {})).toHaveLength(0);
  });

  it("comments with validation and owner/moderator delete", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const post = await createPost(db, { authorId: alice, content: "post" });
    if (!post.ok) throw new Error("setup failed");

    expect(await createComment(db, post.postId, bob, "  ")).toEqual({ ok: false, reason: "empty" });
    const c = await createComment(db, post.postId, bob, "Nice!");
    if (!c.ok) throw new Error("setup failed");

    const listed = await listComments(db, post.postId);
    expect(listed).toHaveLength(1);

    expect(await deleteComment(db, c.commentId, alice, false)).toBe(false);
    expect(await deleteComment(db, c.commentId, alice, true)).toBe(true);
    expect(await listComments(db, post.postId)).toHaveLength(0);
  });

  it("toggles reactions idempotently and tracks saves", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const post = await createPost(db, { authorId: alice, content: "post" });
    if (!post.ok) throw new Error("setup failed");

    expect(await toggleReaction(db, bob, "post", post.postId)).toEqual({ liked: true });
    expect(await toggleReaction(db, bob, "post", post.postId)).toEqual({ liked: false });
    await toggleReaction(db, bob, "post", post.postId);
    const state = await reactionState(db, bob, "post", post.postId);
    expect(state).toEqual({ count: 1, userReaction: "like" });
    expect((await reactionState(db, null, "post", post.postId)).userReaction).toBeNull();

    expect(await savePost(db, bob, post.postId)).toMatchObject({ saved: true });
    expect(await isPostSaved(db, bob, post.postId)).toBe(true);
    expect(await unsavePost(db, bob, post.postId)).toEqual({ saved: false });
    expect(await isPostSaved(db, bob, post.postId)).toBe(false);
  });
});
