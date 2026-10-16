import { describe, expect, it, beforeAll, afterEach } from "vitest";
// Isolate this file's data: every integration file uses its own database
// (workers share one memory server, so shared names would flake).
process.env.MONGODB_DB = "dyne_test_hardening";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { createUser } from "@/lib/db/users";
import { createPost, deleteOwnPost } from "@/lib/db/posts";
import { createComment, listComments } from "@/lib/db/comments";
import { addReaction, toggleReaction } from "@/lib/db/reactions";
import { createCommunity, joinCommunity } from "@/lib/db/communities";
import { createPoll, votePoll } from "@/lib/db/polls";
import { listStudyMaterials, createStudyMaterial } from "@/lib/db/studyMaterials";

async function makeUser(username: string) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  return r.userId;
}

describe("hardening: deleted targets behave as missing", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("comments and reactions on soft-deleted posts are rejected/hidden", async () => {
    const db = await getDb();
    const alice = await makeUser("h_alice");
    const bob = await makeUser("h_bob");
    const post = await createPost(db, { authorId: alice, content: "gone soon" });
    if (!post.ok) throw new Error("setup failed");

    // Live post: commenting + reacting works.
    const c = await createComment(db, post.postId, bob, "Nice!");
    expect(c.ok).toBe(true);
    expect(await addReaction(db, bob, "post", post.postId)).toEqual({ ok: true });
    expect(await listComments(db, post.postId)).toHaveLength(1);

    // Delete the post; threads hide and new interactions are refused.
    expect(await deleteOwnPost(db, post.postId, alice)).toBe(true);
    expect(await listComments(db, post.postId)).toHaveLength(0);
    expect(await addReaction(db, bob, "post", post.postId)).toEqual({ ok: false, reason: "not_found" });
    expect(await toggleReaction(db, bob, "post", post.postId)).toMatchObject({ liked: false, missing: true });
    expect(await createComment(db, post.postId, bob, "late")).toEqual({ ok: false, reason: "post_not_found" });
  });

  it("deleting a post clears its dependents (saves, reactions, comments, notifications)", async () => {
    const db = await getDb();
    const alice = await makeUser("h6_alice");
    const bob = await makeUser("h6_bob");
    const post = await createPost(db, { authorId: alice, content: "cascade me" });
    if (!post.ok) throw new Error("setup failed");
    const pid = post.postId;

    await createComment(db, pid, bob, "first");
    expect(await addReaction(db, bob, "post", pid)).toEqual({ ok: true });
    await col(db, "savedPosts").insertOne({
      userId: toObjectId(bob),
      postId: toObjectId(pid),
      createdAt: new Date(),
    } as never);
    await col(db, "notifications").insertOne({
      recipientId: toObjectId(alice),
      actorId: toObjectId(bob),
      type: "like",
      title: "New like",
      message: "liked your post",
      readAt: null,
      data: { post_id: pid.toHexString() },
      createdAt: new Date(),
    } as never);

    expect(await deleteOwnPost(db, pid, alice)).toBe(true);
    expect(await col(db, "savedPosts").countDocuments({ postId: toObjectId(pid) } as never)).toBe(0);
    expect(await col(db, "reactions").countDocuments({ targetType: "post", targetId: toObjectId(pid) } as never)).toBe(0);
    expect(await col(db, "comments").countDocuments({ postId: toObjectId(pid), deletedAt: null } as never)).toBe(0);
    expect(await col(db, "notifications").countDocuments({ "data.post_id": pid.toHexString() } as never)).toBe(0);
  });

  it("reactions on soft-deleted comments are rejected", async () => {
    const db = await getDb();
    const alice = await makeUser("h2_alice");
    const bob = await makeUser("h2_bob");
    const post = await createPost(db, { authorId: alice, content: "thread" });
    if (!post.ok) throw new Error("setup failed");
    const c = await createComment(db, post.postId, bob, "removable");
    if (!c.ok) throw new Error("setup failed");

    expect(await addReaction(db, alice, "comment", c.commentId)).toEqual({ ok: true });
    await col(db, "comments").updateOne(
      { _id: toObjectId(c.commentId) } as never,
      { $set: { deletedAt: new Date(), updatedAt: new Date() } }
    );
    expect(await addReaction(db, alice, "comment", c.commentId)).toEqual({ ok: false, reason: "not_found" });
  });

  it("admin-style string-id queries must convert to ObjectId to match", async () => {
    const db = await getDb();
    const alice = await makeUser("h3_alice");
    const post = await createPost(db, { authorId: alice, content: "moderate me" });
    if (!post.ok) throw new Error("setup failed");
    const hex = post.postId.toHexString();
    // A raw hex string never matches an ObjectId _id (the old admin bug).
    const raw = await col(db, "posts").updateOne(
      { _id: hex } as never,
      { $set: { deletedAt: new Date() } }
    );
    expect(raw.matchedCount).toBe(0);
    // Converted ids match (the fixed admin behavior).
    const fixed = await col(db, "posts").updateOne(
      { _id: toObjectId(hex) } as never,
      { $set: { deletedAt: new Date() } }
    );
    expect(fixed.matchedCount).toBe(1);
  });
});

describe("hardening: study materials + polls", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  function mat(over: Record<string, unknown> = {}) {
    return {
      title: "Hardening Notes",
      description: "defense in depth",
      subject: "Physics",
      classGrade: "10-A",
      topic: "Motion",
      materialType: "notes" as const,
      tags: [],
      bucket: "study-materials",
      key: "uploader1/hardening.pdf",
      url: "/api/files/study-materials/uploader1/hardening.pdf",
      mime: "application/pdf",
      size: 512,
      fileName: "hardening.pdf",
      ...over,
    };
  }

  it("rejected materials stay hidden even when the removal flag is cleared", async () => {
    const db = await getDb();
    const u = await makeUser("h4_u");
    const created = await createStudyMaterial(db, u, mat({ key: "u/h.pdf", url: "/api/files/study-materials/u/h.pdf" }));
    if (!created.ok) throw new Error("setup failed");
    expect(await listStudyMaterials(db, {})).toHaveLength(1);
    // Simulate a legacy/inconsistent row: rejected but not flagged removed.
    await col(db, "studyMaterials").updateOne(
      { _id: toObjectId(created.materialId) } as never,
      { $set: { status: "rejected", isRemoved: false } }
    );
    expect(await listStudyMaterials(db, {})).toHaveLength(0);
    expect(await listStudyMaterials(db, { includeRemoved: true })).toHaveLength(1);
  });

  it("poll re-votes change the option while preserving the original createdAt", async () => {
    const db = await getDb();
    const owner = await makeUser("h5_owner");
    const member = await makeUser("h5_member");
    const c = await createCommunity(db, owner, { name: "Hardening Club", slug: "hardening-polls" });
    if (!c.ok) throw new Error("community setup failed");
    await joinCommunity(db, c.communityId, member);
    const created = await createPoll(db, member, {
      communityId: c.communityId.toHexString(), question: "Day?", options: ["Mon", "Fri"],
    });
    if (!created.ok) throw new Error("poll setup failed");
    const pid = created.pollId.toHexString();
    expect(await votePoll(db, pid, member, 0)).toEqual({ ok: true });
    const first = await col(db, "pollVotes").findOne({
      pollId: toObjectId(pid), userId: toObjectId(member),
    } as never);
    expect(first?.optionIndex).toBe(0);
    const firstCreated = (first?.createdAt as Date).getTime();
    await new Promise((r) => setTimeout(r, 5));
    expect(await votePoll(db, pid, member, 1)).toEqual({ ok: true });
    const second = await col(db, "pollVotes").findOne({
      pollId: toObjectId(pid), userId: toObjectId(member),
    } as never);
    expect(second?.optionIndex).toBe(1);
    expect((second?.createdAt as Date).getTime()).toBe(firstCreated);
  });
});
