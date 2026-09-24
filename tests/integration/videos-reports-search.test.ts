import { describe, expect, it, beforeAll, afterEach } from "vitest";
// Isolate this file's data: every integration file uses its own database
// (workers share one memory server, so shared names would flake).
process.env.MONGODB_DB = "dyne_test_misc";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser } from "@/lib/db/users";
import { createPost } from "@/lib/db/posts";
import {
  createVideo,
  listVideos,
  recordVideoView,
  deleteVideo,
} from "@/lib/db/videos";
import {
  createReport,
  listReports,
  reviewReport,
} from "@/lib/db/reports";
import { globalSearch } from "@/lib/db/search";
import { issuePasswordReset, consumePasswordReset } from "@/lib/auth/passwordReset";
import { verifyPassword } from "@/lib/auth/password";

async function makeUser(username: string, role: "student" | "teacher" | "admin" = "student") {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  if (role !== "student") {
    await col(db, "users").updateOne({ _id: r.userId } as never, { $set: { role } });
  }
  return r.userId;
}

describe("videos, reports, search, password reset", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("manages videos with throttled views and owner/admin delete", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    expect(await createVideo(db, alice, { title: "x", videoUrl: "/api/files/watch-videos/a/b.mp4" })).toEqual({
      ok: false, reason: "bad_title",
    });
    const created = await createVideo(db, alice, {
      title: "Robotics finals", videoUrl: "/api/files/watch-videos/a/b.mp4", category: "clubs",
    });
    if (!created.ok) throw new Error("setup failed");

    const first = await recordVideoView(db, created.videoId, bob);
    expect(first).toMatchObject({ ok: true, viewCount: 1 });
    const second = await recordVideoView(db, created.videoId, bob);
    expect(second).toMatchObject({ ok: true, viewCount: 1, throttled: true });

    expect(await deleteVideo(db, created.videoId, bob, "student")).toEqual({
      ok: false, reason: "forbidden",
    });
    expect((await deleteVideo(db, created.videoId, alice, "student")).ok).toBe(true);
    expect(await listVideos(db, {})).toHaveLength(0);
  });

  it("runs the report -> review -> removal pipeline with role gates", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const admin = await makeUser("root", "admin");
    const post = await createPost(db, { authorId: alice, content: "questionable" });
    if (!post.ok) throw new Error("setup failed");

    const rep = await createReport(db, bob, {
      targetType: "post", targetId: post.postId, reason: "spam",
    });
    expect(rep.ok).toBe(true);

    const own = await listReports(db, bob, "student", {});
    expect(own.reports).toHaveLength(1);
    expect(own.isModerator).toBe(false);

    expect(
      await reviewReport(db, (rep as { reportId: unknown }).reportId as string, bob, "student", { status: "dismissed" })
    ).toEqual({ ok: false, reason: "forbidden" });

    const all = await listReports(db, admin, "admin", { status: "pending" });
    expect(all.reports).toHaveLength(1);

    const reviewed = await reviewReport(
      db, (rep as { reportId: unknown }).reportId as string, admin, "admin",
      { status: "resolved", action: "content_removal" }
    );
    expect(reviewed.ok).toBe(true);
    const feed = await col(db, "posts").find({ deletedAt: null } as never).toArray();
    expect(feed).toHaveLength(0);
  });

  it("searches across entities server-side", async () => {
    const db = await getDb();
    const alice = await makeUser("robotics_anna");
    await createPost(db, { authorId: alice, content: "robotics club meets Friday" });
    await col(db, "communities").insertOne({
      slug: "robotics", name: "Robotics Society", description: "build bots",
      imageUrl: null, ownerId: alice, isPrivate: false,
      createdAt: new Date(), updatedAt: new Date(),
    } as never);

    const results = await globalSearch(db, "robotics");
    expect(results.people.length).toBeGreaterThanOrEqual(1);
    expect(results.posts.length).toBeGreaterThanOrEqual(1);
    expect(results.communities.length).toBeGreaterThanOrEqual(1);

    const short = await globalSearch(db, "x");
    expect(short.people).toHaveLength(0);
    const none = await globalSearch(db, "zzz-no-such-thing");
    expect(none.posts).toHaveLength(0);
  });

  it("issues single-use expiring reset tokens and rotates credentials", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    const sent: Array<{ email: string; token: string }> = [];
    const mailer = {
      async sendPasswordReset(email: string, token: string) {
        sent.push({ email, token });
      },
    };
    await issuePasswordReset(db, alice, mailer, "alice@school.test");
    expect(sent).toHaveLength(1);
    expect(sent[0].token.length).toBeGreaterThan(30);

    expect(await consumePasswordReset(db, sent[0].token, "short")).toEqual({ ok: false, reason: "weak" });
    expect(await consumePasswordReset(db, "bogus-token-value-1234567890", "New-Password-1")).toEqual({
      ok: false, reason: "invalid",
    });
    expect(await consumePasswordReset(db, sent[0].token, "New-Password-1")).toEqual({ ok: true });
    // Single use: token row is gone.
    expect(await consumePasswordReset(db, sent[0].token, "Another-Pass-1")).toEqual({
      ok: false, reason: "invalid",
    });

    const user = await col(db, "users").findOne({ _id: alice } as never);
    expect(await verifyPassword("New-Password-1", String(user?.passwordHash))).toBe(true);
    expect(await verifyPassword("Password-1", String(user?.passwordHash))).toBe(false);
  });
});
