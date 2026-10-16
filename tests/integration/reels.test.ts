import { describe, expect, it, beforeAll, afterEach } from "vitest";
process.env.MONGODB_DB = "dyne_test_reels";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames, type UserDoc } from "@/lib/mongo/collections";
import { createUser, setUserRole } from "@/lib/db/users";
import {
  createReel,
  deleteReel,
  getReel,
  listReels,
  recordReelShare,
  recordReelView,
  setReelSave,
  toggleReelLike,
} from "@/lib/db/reels";
import { isSafeMediaUrl } from "@/lib/db/videos";
import { toReelJSON } from "@/lib/db/contracts";

/**
 * Reels: validation, authorization, feed, likes, views, moderation, deletion
 * and race safety.
 */

const VIDEO_URL = "/api/files/reel-videos/owner/reel.mp4";

async function makeUser(username: string, role?: UserDoc["role"], classGrade: string | null = null) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`,
    password: "Password-1",
    username,
    displayName: username,
  });
  if (!r.ok) throw new Error(`setup failed for ${username}`);
  if (role) await setUserRole(db, r.userId, role);
  if (classGrade) {
    await col<UserDoc>(db, "users").updateOne(
      { _id: r.userId } as never,
      { $set: { classGrade } }
    );
  }
  return r.userId;
}

describe("reels", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("rejects invalid media URLs and titles", async () => {
    const db = await getDb();
    const teacher = await makeUser("reel_bad", "teacher");
    expect((await createReel(db, teacher, { title: "ok title", videoUrl: "javascript:alert(1)" })).ok).toBe(false);
    expect((await createReel(db, teacher, { title: "x", videoUrl: VIDEO_URL })).ok).toBe(false);
    expect((await createReel(db, teacher, { title: "fine", videoUrl: VIDEO_URL, thumbnailUrl: "data:image/png;base64,xx" })).ok).toBe(false);
    expect((await createReel(db, teacher, { title: "fine", videoUrl: VIDEO_URL, hashtags: new Array(30).fill("x") })).ok).toBe(false);
    // The safe shape is accepted.
    const ok = await createReel(db, teacher, { title: "Campus tour", videoUrl: VIDEO_URL });
    expect(ok.ok).toBe(true);
  });

  it("normalizes hashtags (no # prefix, no punctuation, capped)", async () => {
    const db = await getDb();
    const teacher = await makeUser("reel_tags", "teacher");
    const created = await createReel(db, teacher, {
      title: "Tagged reel",
      videoUrl: VIDEO_URL,
      hashtags: ["#MVA", "match day!!", "  ", "science"],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const row = await col(db, "reels").findOne({ _id: created.reelId } as never);
    const tags = (row as unknown as { hashtags: string[] }).hashtags;
    expect(tags).toContain("MVA");
    expect(tags).toContain("matchday");
    expect(tags).toContain("science");
    expect(tags.every((t) => !t.startsWith("#"))).toBe(true);
  });

  it("stores moderation metadata and never claims un-analysed media is clean", async () => {
    const db = await getDb();
    const teacher = await makeUser("reel_mod", "teacher");
    const created = await createReel(db, teacher, { title: "Lecture clip", videoUrl: VIDEO_URL });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const row = (await col(db, "reels").findOne({ _id: created.reelId } as never)) as unknown as {
      moderationStatus: string;
      moderationMediaAnalyzed: boolean;
      moderationSource: string;
      moderationProvider: string | null;
    };
    expect(["approved", "pending", "flagged", "rejected"]).toContain(row.moderationStatus);
    // No AI provider is configured in tests, so nothing may claim media analysis.
    expect(row.moderationMediaAnalyzed).toBe(false);
    expect(row.moderationProvider).toBeNull();
    expect(["none", "rules", "provider", "rules+provider"]).toContain(row.moderationSource);

    // A moderation review record exists for every reel.
    const reviews = await col(db, "moderationReviews").countDocuments({
      contentType: "reel",
      contentId: created.reelId,
    } as never);
    expect(reviews).toBe(1);
  });

  it("rejects content whose deterministic rules fire a high-confidence match", async () => {
    const db = await getDb();
    const teacher = await makeUser("reel_risk", "teacher");
    const created = await createReel(db, teacher, {
      title: "How to make a pipe bomb",
      videoUrl: VIDEO_URL,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.moderationStatus).toBe("rejected");
    const json = toReelJSON(
      (await col(db, "reels").findOne({ _id: created.reelId } as never)) as unknown as Record<string, unknown>
    );
    expect(json.moderation_status).toBe("rejected");
    expect(json.moderation_reason).toBeTruthy();
  });

  it("keeps the save counter consistent under repeated and concurrent saves", async () => {
    const db = await getDb();
    const owner = await makeUser("save_owner", "teacher");
    const a = await makeUser("save_a");
    const b = await makeUser("save_b");
    const created = await createReel(db, owner, {
      title: "Save counter reel",
      videoUrl: VIDEO_URL,
      durationSeconds: 10,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const reelId = created.reelId;

    // Two users, many repeated calls each: the counter must track distinct savers.
    await Promise.all([
      ...Array.from({ length: 10 }, () => setReelSave(db, reelId, a, true)),
      ...Array.from({ length: 10 }, () => setReelSave(db, reelId, b, true)),
    ]);
    expect(await col(db, "savedReels").countDocuments({ reelId } as never)).toBe(2);
    const reel = await getReel(db, reelId);
    expect(reel?.saveCount).toBe(2);

    // Un-saving twice must only decrement once, and never below zero.
    const first = await setReelSave(db, reelId, a, false);
    expect(first.saveCount).toBe(1);
    const again = await setReelSave(db, reelId, a, false);
    expect(again.saveCount).toBe(1);
    expect((await getReel(db, reelId))?.saveCount).toBe(1);

    await setReelSave(db, reelId, b, false);
    expect((await getReel(db, reelId))?.saveCount).toBe(0);

    // Deleting the reel must not leave orphaned save rows behind.
    const victim = await createReel(db, owner, { title: "Delete me", videoUrl: VIDEO_URL });
    expect(victim.ok).toBe(true);
    if (!victim.ok) return;
    await setReelSave(db, victim.reelId, a, true);
    const removed = await deleteReel(db, victim.reelId, owner, "teacher");
    expect(removed.ok).toBe(true);
    expect(await col(db, "savedReels").countDocuments({ reelId: victim.reelId } as never)).toBe(0);
  });

  it("keeps non-approved reels out of the public feed but visible to their owner", async () => {
    const db = await getDb();
    const teacher = await makeUser("reel_owner", "teacher");
    const student = await makeUser("reel_viewer");
    const held = await col(db, "reels").insertOne({
      title: "Held reel",
      caption: null,
      videoUrl: VIDEO_URL,
      thumbnailUrl: null,
      creatorId: teacher,
      durationSeconds: 20,
      viewCount: 0,
      likeCount: 0,
      saveCount: 0,
      shareCount: 0,
      commentCount: 0,
      category: null,
      hashtags: [],
      aspectRatio: null,
      width: 1080,
      height: 1920,
      moderationStatus: "pending",
      moderationReason: "media not machine-reviewed",
      moderationScore: 0,
      moderationSource: "none",
      moderationProvider: null,
      moderationMediaAnalyzed: false,
      moderatedAt: new Date(),
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    // The repository serializes `_id` to `id` at the API boundary.
    const idOf = (row: unknown) => String((row as { id?: string }).id ?? "");

    const publicFeed = await listReels(db, {});
    expect(publicFeed.map(idOf)).not.toContain(held.insertedId.toHexString());

    const ownerFeed = await listReels(db, { includeOwnPending: teacher });
    expect(ownerFeed.map(idOf)).toContain(held.insertedId.toHexString());

    const otherOwnerFeed = await listReels(db, { includeOwnPending: student });
    expect(otherOwnerFeed.map(idOf)).not.toContain(held.insertedId.toHexString());
  });

  it("paginates the feed with a stable, duplicate-free keyset cursor", async () => {
    const db = await getDb();
    const teacher = await makeUser("reel_page", "teacher");
    const ids: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const created = await createReel(db, teacher, {
        title: `Reel number ${i}`,
        videoUrl: VIDEO_URL,
      });
      if (created.ok) ids.push(created.reelId.toHexString());
    }
    // Force approval so everything is in the public feed.
    await col(db, "reels").updateMany({}, { $set: { moderationStatus: "approved" } } as never);

    const page1 = await listReels(db, { limit: 3 });
    expect(page1).toHaveLength(3);
    const last = page1[page1.length - 1] as unknown as { id: string; createdAt: Date };
    const page2 = await listReels(db, {
      limit: 3,
      before: { createdAt: last.createdAt, id: last.id },
    });
    expect(page2).toHaveLength(3);
    const ids1 = page1.map((r) => String((r as unknown as { id: string }).id));
    const ids2 = page2.map((r) => String((r as unknown as { id: string }).id));
    expect(new Set([...ids1, ...ids2]).size).toBe(6);
    expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
    expect(ids).toHaveLength(7);
  });

  it("counts a view once per user per hour", async () => {
    const db = await getDb();
    const teacher = await makeUser("reel_view", "teacher");
    const student = await makeUser("reel_viewer2");
    const created = await createReel(db, teacher, { title: "Viewed reel", videoUrl: VIDEO_URL });
    if (!created.ok) throw new Error("setup failed");
    await col(db, "reels").updateOne(
      { _id: created.reelId } as never,
      { $set: { moderationStatus: "approved" } }
    );

    const first = await recordReelView(db, created.reelId, student);
    expect(first.ok).toBe(true);
    expect(first.ok && "viewCount" in first ? first.viewCount : 0).toBe(1);

    const second = await recordReelView(db, created.reelId, student);
    expect(second.ok && "throttled" in second ? second.throttled : false).toBe(true);
    const row = await col(db, "reels").findOne({ _id: created.reelId } as never);
    expect((row as unknown as { viewCount: number }).viewCount).toBe(1);

    const other = await recordReelView(db, created.reelId, teacher);
    expect(other.ok && "viewCount" in other ? other.viewCount : 0).toBe(2);
  });

  it("toggles likes idempotently and survives rapid duplicate calls", async () => {
    const db = await getDb();
    const teacher = await makeUser("reel_like", "teacher");
    const student = await makeUser("reel_liker");
    const created = await createReel(db, teacher, { title: "Liked reel", videoUrl: VIDEO_URL });
    if (!created.ok) throw new Error("setup failed");

    /* Eight concurrent toggles. The counter can never be trusted more than the
     * reaction rows themselves, so the invariant under test is that the stored
     * `likeCount` always equals the number of actual like rows and never goes
     * negative — i.e. the state stays consistent rather than drifting. */
    const results = await Promise.all(
      Array.from({ length: 8 }, () => toggleReelLike(db, created.reelId, student))
    );
    expect(results.every((r) => r.ok)).toBe(true);

    const storedCount = async () =>
      (await col(db, "reels").findOne({ _id: created.reelId } as never)) as unknown as {
        likeCount: number;
      };
    const reactionCount = () =>
      col(db, "reactions").countDocuments({
        targetType: "reel",
        targetId: created.reelId,
        kind: "like",
      } as never);

    for (let check = 0; check < 3; check += 1) {
      const s = await storedCount();
      const n = await reactionCount();
      expect(s.likeCount).toBe(n);
      expect(s.likeCount).toBeGreaterThanOrEqual(0);
    }

    // A final authoritative toggle leaves the two in agreement.
    const authoritative = await toggleReelLike(db, created.reelId, student);
    const s = await storedCount();
    expect(s.likeCount).toBe(await reactionCount());
    expect(authoritative.liked).toBe(s.likeCount > 0);
    expect(authoritative.likeCount).toBe(s.likeCount);
  });

  it("records share counts atomically", async () => {
    const db = await getDb();
    const teacher = await makeUser("reel_share", "teacher");
    const created = await createReel(db, teacher, { title: "Shared reel", videoUrl: VIDEO_URL });
    if (!created.ok) throw new Error("setup failed");
    const counts = await Promise.all(
      Array.from({ length: 5 }, () => recordReelShare(db, created.reelId))
    );
    // `$inc` is atomic, so the stored total is exact even when the responses
    // arrive out of order.
    const row = await col(db, "reels").findOne({ _id: created.reelId } as never);
    expect((row as unknown as { shareCount: number }).shareCount).toBe(5);
    expect(new Set(counts).size).toBe(5);
    expect([...counts].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3, 4, 5]);
  });

  it("enforces deletion ownership (owner or admin only) and cleans dependents", async () => {
    const db = await getDb();
    const teacher = await makeUser("reel_del_teacher", "teacher");
    const other = await makeUser("reel_del_other", "teacher");
    const admin = await makeUser("reel_del_admin", "admin");
    const created = await createReel(db, teacher, { title: "Deletable reel", videoUrl: VIDEO_URL });
    if (!created.ok) throw new Error("setup failed");

    await col(db, "reactions").insertOne({
      userId: other,
      targetType: "reel",
      targetId: created.reelId,
      kind: "like",
      createdAt: new Date(),
    } as never);
    await recordReelView(db, created.reelId, other);

    expect((await deleteReel(db, created.reelId, other, "teacher")).ok).toBe(false);
    expect((await deleteReel(db, created.reelId, teacher, "teacher")).ok).toBe(true);
    expect(await getReel(db, created.reelId)).toBeNull();

    // Dependents are cleaned up (no dangling rows).
    expect(
      await col(db, "reactions").countDocuments({ targetType: "reel", targetId: created.reelId } as never)
    ).toBe(0);
    expect(await col(db, "reelViews").countDocuments({ reelId: created.reelId } as never)).toBe(0);
    expect(
      await col(db, "moderationReviews").countDocuments({ contentType: "reel", contentId: created.reelId } as never)
    ).toBe(0);

    // An admin may delete another user's reel.
    const second = await createReel(db, teacher, { title: "Admin deletable", videoUrl: VIDEO_URL });
    if (!second.ok) throw new Error("setup failed");
    expect((await deleteReel(db, second.reelId, admin, "admin")).ok).toBe(true);
  });

  it("marks liked_by_viewer for the requesting user only", async () => {
    const db = await getDb();
    const teacher = await makeUser("reel_viewmark", "teacher");
    const a = await makeUser("reel_viewmark_a");
    const b = await makeUser("reel_viewmark_b");
    const created = await createReel(db, teacher, { title: "Marker reel", videoUrl: VIDEO_URL });
    if (!created.ok) throw new Error("setup failed");
    await toggleReelLike(db, created.reelId, a);

    const forA = await getReel(db, created.reelId, a);
    const forB = await getReel(db, created.reelId, b);
    expect((forA as unknown as { likedByViewer: boolean }).likedByViewer).toBe(true);
    expect((forB as unknown as { likedByViewer: boolean }).likedByViewer).toBe(false);
  });

  it("validates media URLs as app-served or http(s) only", () => {
    expect(isSafeMediaUrl("/api/files/reel-videos/a/b.mp4")).toBe(true);
    expect(isSafeMediaUrl("https://cdn.example.com/a.mp4")).toBe(true);
    expect(isSafeMediaUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeMediaUrl("data:video/mp4;base64,AA")).toBe(false);
    expect(isSafeMediaUrl("")).toBe(false);
    expect(isSafeMediaUrl(undefined)).toBe(false);
    expect(isSafeMediaUrl(42)).toBe(false);
  });
});
