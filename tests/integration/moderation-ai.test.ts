import { describe, expect, it, beforeAll, afterEach } from "vitest";
process.env.MONGODB_DB = "dyne_test_moderation_ai";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames, type UserDoc } from "@/lib/mongo/collections";
import { createUser, setUserRole } from "@/lib/db/users";
import {
  checkLinks,
  getModerationProvider,
  providerStatusSummary,
  runDeterministicChecks,
  runModerationPipeline,
  type ProviderConfig,
} from "@/lib/moderation/provider";
import {
  applyModerationOverride,
  moderationCounts,
  moderateContent,
} from "@/lib/moderation";
import { createCommunity, joinCommunity } from "@/lib/db/communities";
import { createConversation, sendMessage } from "@/lib/db/chat";
import { toObjectId } from "@/lib/mongo/ids";
import { ObjectId } from "mongodb";
import { createBlog } from "@/lib/db/content";
import { createStudyMaterial } from "@/lib/db/studyMaterials";

/**
 * Moderation pipeline behaviour, with and without an AI provider.
 */

async function makeUser(username: string, role?: UserDoc["role"]) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`,
    password: "Password-1",
    username,
    displayName: username,
  });
  if (!r.ok) throw new Error(`setup failed for ${username}`);
  if (role) await setUserRole(db, r.userId, role);
  return r.userId;
}

/**
 * A provider stub that answers a fixed verdict with a fixed confidence.
 * `confidence` is the provider's confidence in the verdict it returns, so a
 * clean verdict with low confidence is (correctly) not auto-approved.
 */
function fakeProvider(verdict: "flag" | "clean", confidence: number): ProviderConfig {
  return {
    provider: {
      name: "test-classifier",
      capabilities: ["harassment", "spam"],
      supportsMedia: false,
      async moderate() {
        return verdict === "flag"
          ? { available: true, flagged: true, categories: ["harassment"], confidence }
          : { available: true, flagged: false, categories: [], confidence };
      },
    },
    configured: true,
    status: {
      configured: true,
      provider: "test-classifier",
      capabilities: ["harassment", "spam"],
      supportsMedia: false,
    },
  };
}

/** A provider that always fails, simulating a timeout. */
function brokenProvider(): ProviderConfig {
  return {
    provider: {
      name: "broken",
      capabilities: ["harassment"],
      supportsMedia: false,
      async moderate() {
        return {
          available: false,
          flagged: false,
          categories: [],
          confidence: null,
          diagnostic: "timeout",
        };
      },
    },
    configured: true,
    status: { configured: true, provider: "broken", capabilities: ["harassment"], supportsMedia: false },
  };
}

const NO_PROVIDER: ProviderConfig = {
  provider: null,
  configured: false,
  status: { configured: false, provider: null, capabilities: [], supportsMedia: false },
};

describe("content moderation", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("runs deterministic rules before any provider call", () => {
    expect(runDeterministicChecks("")).toEqual([]);
    expect(runDeterministicChecks(undefined)).toEqual([]);
    expect(runDeterministicChecks("hello campus")).toEqual([]);
    const hits = runDeterministicChecks("I will kill you");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.category === "violence")).toBe(true);
    // Character spam is detected too.
    expect(runDeterministicChecks("a".repeat(60)).some((h) => h.category === "spam")).toBe(true);
  });

  it("flags non-allow-listed links as a low-confidence spam signal", () => {
    expect(checkLinks("no links here")).toEqual([]);
    expect(checkLinks("visit https://dyne.app/feed")).toEqual([]);
    const hits = checkLinks("visit https://suspicious.example.xyz/deal");
    expect(hits).toHaveLength(1);
    expect(hits[0].category).toBe("spam");
    expect(hits[0].confidence).toBeLessThan(0.5);
    expect(checkLinks("https://not a url")).toHaveLength(1);
  });

  it("approves clean content with a confident provider verdict", async () => {
    const result = await runModerationPipeline(
      { targetType: "blog", text: "A friendly article about the science fest." },
      fakeProvider("clean", 0.98)
    );
    expect(result.decision).toBe("approved");
    expect(result.provider).toBe("test-classifier");
    expect(result.findings).toEqual([]);
  });

  it("holds a low-confidence clean verdict instead of auto-approving", async () => {
    const result = await runModerationPipeline(
      { targetType: "blog", text: "A friendly article about the science fest." },
      fakeProvider("clean", 0.4)
    );
    expect(result.decision).toBe("pending");
    expect(result.needsManualReview).toBe(true);
  });

  it("rejects high-confidence provider verdicts and flags borderline ones", async () => {
    const high = await runModerationPipeline(
      { targetType: "blog", text: "an unremarkable sentence" },
      fakeProvider("flag", 0.97)
    );
    expect(high.decision).toBe("rejected");

    // A confident-but-sub-threshold flag is queued for a human (`flagged`).
    const mid = await runModerationPipeline(
      { targetType: "blog", text: "an unremarkable sentence" },
      fakeProvider("flag", 0.5)
    );
    expect(mid.decision).toBe("flagged");
    expect(mid.needsManualReview).toBe(true);
    // Never silently deleted on uncertainty.
    expect(mid.decision).not.toBe("rejected");

    // Even a weak provider flag is queued rather than deleted.
    const weak = await runModerationPipeline(
      { targetType: "blog", text: "an unremarkable sentence" },
      fakeProvider("flag", 0.1)
    );
    expect(weak.decision).toBe("flagged");
    expect(weak.needsManualReview).toBe(true);
  });

  it("falls back safely when the provider times out or errors", async () => {
    const broken = await runModerationPipeline(
      { targetType: "blog", text: "nothing objectionable here" },
      brokenProvider()
    );
    // Falls back to rules + manual review; never claims an AI verdict.
    expect(broken.provider).toBeNull();
    expect(["pending", "flagged", "approved"]).toContain(broken.decision);
    expect(broken.needsManualReview).toBe(true);

    const flagged = await runModerationPipeline(
      { targetType: "blog", text: "I will kill you" },
      brokenProvider()
    );
    expect(flagged.decision).toBe("rejected");
  });

  it("holds media for manual review when no provider inspects the bytes", async () => {
    const result = await runModerationPipeline(
      { targetType: "reel", text: "a nice clip", mediaProvided: true, mediaUrl: "/api/files/x.mp4" },
      fakeProvider("clean", 0.02)
    );
    expect(result.mediaAnalyzed).toBe(false);
    // A configured provider that cannot inspect media ⇒ held for a human.
    expect(result.decision).toBe("pending");
    expect(result.needsManualReview).toBe(true);
  });

  it("lets trusted staff authors publish on rules alone when no provider exists", async () => {
    const result = await runModerationPipeline(
      {
        targetType: "reel",
        text: "a nice clip",
        mediaProvided: true,
        mediaUrl: "/api/files/x.mp4",
        trustedAuthor: true,
      },
      NO_PROVIDER
    );
    expect(result.decision).toBe("approved");
    // Still honest: the media was never machine-reviewed.
    expect(result.mediaAnalyzed).toBe(false);
    expect(result.provider).toBeNull();
    expect(result.needsManualReview).toBe(true);
  });

  it("holds untrusted community media when no provider exists", async () => {
    const result = await runModerationPipeline(
      { targetType: "post", text: "community clip", mediaProvided: true, mediaUrl: "/api/files/y.mp4" },
      NO_PROVIDER
    );
    expect(result.decision).toBe("pending");
  });

  it("reports provider status honestly without exposing secrets", () => {
    const summary = providerStatusSummary({} as unknown as NodeJS.ProcessEnv);
    expect(summary.configured).toBe(false);
    expect(summary.mode).toBe("rules_and_manual");
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(/api[_-]?key/i);
    expect(serialized).not.toMatch(/prompt/i);
  });

  it("refuses to enable a provider without both url and key", () => {
    expect(getModerationProvider({} as unknown as NodeJS.ProcessEnv).configured).toBe(false);
    expect(
      getModerationProvider({ CONTENT_MODERATION_API_URL: "https://x.test/m" } as unknown as NodeJS.ProcessEnv).configured
    ).toBe(false);
    const on = getModerationProvider({
      CONTENT_MODERATION_API_URL: "https://x.test/m",
      CONTENT_MODERATION_API_KEY: "secret",
    } as unknown as NodeJS.ProcessEnv);
    expect(on.configured).toBe(true);
    expect(on.status.provider).toBe("http-classifier");
  });

  it("records a moderation review and never stores prompts or keys", async () => {
    const db = await getDb();
    const author = await makeUser("mod_author", "teacher");
    const result = await moderateContent(db, {
      contentType: "blog",
      contentId: toObjectId("507f1f77bcf86cd799439011"),
      authorId: author,
      text: "How to make a pipe bomb",
      excerpt: "How to make a pipe bomb",
    });
    expect(result.decision).toBe("rejected");
    const row = await col(db, "moderationReviews").findOne({
      contentType: "blog",
      contentId: toObjectId("507f1f77bcf86cd799439011"),
    } as never);
    expect(row).not.toBeNull();
    const raw = row as unknown as Record<string, unknown>;
    expect(String(raw.status)).toBe("rejected");
    expect(raw.provider).toBeNull();
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toMatch(/prompt/i);
    expect(serialized).not.toMatch(/secret/i);
  });

  it("supports auditable human overrides that preserve the original verdict", async () => {
    const db = await getDb();
    const moderator = await makeUser("mod_moderator", "moderator");
    const author = await makeUser("mod_blogger", "teacher");
    await moderateContent(db, {
      contentType: "blog",
      contentId: toObjectId("507f1f77bcf86cd799439012"),
      authorId: author,
      text: "borderline promotional content",
      trustedAuthor: true,
    });
    const review = await col(db, "moderationReviews").findOne({
      contentType: "blog",
      contentId: toObjectId("507f1f77bcf86cd799439012"),
    } as never);
    const reviewId = (review as unknown as { _id: ObjectId })._id;
    const before = (review as unknown as { source: string }).source;

    const applied = await applyModerationOverride(db, reviewId, {
      action: "approve",
      actorId: moderator,
      reason: "false positive confirmed",
    });
    expect(applied.ok).toBe(true);

    const after = (await col(db, "moderationReviews").findOne({ _id: reviewId } as never)) as unknown as {
      status: string;
      source: string;
      reviewedBy: ObjectId;
      overrideReason: string | null;
    };
    expect(after.status).toBe("approved");
    // The machine verdict is preserved, not overwritten.
    expect(after.source).toBe(before);
    expect(after.overrideReason).toBe("false positive confirmed");
    expect(after.reviewedBy.toHexString()).toBe(moderator.toHexString());

    // A second decision is refused (409-shaped conflict at the route layer).
    const again = await applyModerationOverride(db, reviewId, { action: "reject", actorId: moderator });
    expect(again.ok).toBe(false);
    expect(again.ok === false && again.reason).toBe("already_decided");

    // Audit record exists for the override.
    expect(
      await col(db, "auditLogs").countDocuments({ action: "moderation.override.approve" } as never)
    ).toBe(1);
  });

  it("reports real queue counts", async () => {
    const db = await getDb();
    const author = await makeUser("mod_counts", "teacher");
    await moderateContent(db, {
      contentType: "blog",
      contentId: toObjectId("507f1f77bcf86cd799439013"),
      authorId: author,
      text: "clean article",
      trustedAuthor: true,
    });
    await moderateContent(db, {
      contentType: "blog",
      contentId: toObjectId("507f1f77bcf86cd799439014"),
      authorId: author,
      text: "I will kill you",
      trustedAuthor: true,
    });
    const counts = await moderationCounts(db);
    expect(counts.total).toBe(2);
    expect(counts.approved + counts.rejected + counts.flagged + counts.pending).toBe(2);
    expect(counts.rejected).toBeGreaterThanOrEqual(1);
  });

  it("stores only an excerpt for group messages, never the full body", async () => {
    const db = await getDb();
    const owner = await makeUser("mod_owner");
    const member = await makeUser("mod_member");
    const community = await createCommunity(db, owner, {
      name: "Moderation Club",
      slug: "moderation-club",
    });
    if (!community.ok) throw new Error("setup failed");
    await joinCommunity(db, community.communityId, member);
    const convo = await createConversation(db, owner, {
      type: "group",
      participantIds: [member],
      name: "Club chat",
      communityId: community.communityId,
    });
    if (!convo.ok) throw new Error("setup failed");

    const longMessage = `Safe opening line. ${"x".repeat(500)} Please review the schedule.`;
    const sent = await sendMessage(db, convo.conversationId, owner, longMessage);
    expect(sent.ok).toBe(true);

    const review = await col(db, "moderationReviews").findOne({
      contentType: "message",
      conversationId: convo.conversationId,
    } as never);
    expect(review).not.toBeNull();
    const excerpt = (review as unknown as { excerpt: string }).excerpt;
    expect(excerpt.length).toBeLessThanOrEqual(240);
    expect(excerpt.length).toBeLessThan(longMessage.length);
    // The full message body is NOT copied into the moderation store.
    expect(JSON.stringify(review)).not.toContain("Safe opening line." + "x".repeat(200));
    // It stays in the chat store for the conversation members.
    expect(
      await col(db, "chatMessages").countDocuments({ conversationId: convo.conversationId } as never)
    ).toBe(1);
  });

  it("blocks a high-confidence group-message violation without delivering it", async () => {
    const db = await getDb();
    const owner = await makeUser("mod_block_owner");
    const member = await makeUser("mod_block_member");
    const community = await createCommunity(db, owner, {
      name: "Safety Club",
      slug: "safety-club",
    });
    if (!community.ok) throw new Error("setup failed");
    await joinCommunity(db, community.communityId, member);
    const convo = await createConversation(db, owner, {
      type: "group",
      participantIds: [member],
      name: "Safety chat",
      communityId: community.communityId,
    });
    if (!convo.ok) throw new Error("setup failed");

    const sent = await sendMessage(db, convo.conversationId, member, "here is how to make a pipe bomb");
    expect(sent.ok).toBe(false);
    expect(sent.ok === false && sent.reason).toBe("blocked");
    // Nothing was delivered…
    expect(
      await col(db, "chatMessages").countDocuments({ conversationId: convo.conversationId } as never)
    ).toBe(0);
    // …but the attempt is still visible to moderators.
    const review = await col(db, "moderationReviews").findOne({
      contentType: "message",
      conversationId: convo.conversationId,
    } as never);
    expect(review).not.toBeNull();
    expect(String((review as unknown as { status: string }).status)).toBe("rejected");
  });

  it("links every blog and study-material review to the real document id", async () => {
    const db = await getDb();
    const author = await makeUser("mod_link", "teacher");

    // --- blog -------------------------------------------------------------
    const blog = await createBlog(db, author, {
      title: "Hydration notes",
      content: "A short, well-formed campus article about server rendering.",
      isPublished: true,
    });
    expect(blog.ok).toBe(true);
    if (!blog.ok) return;
    const blogReview = await col(db, "moderationReviews").findOne({
      contentType: "blog",
      contentId: blog.blogId,
    } as never);
    expect(blogReview).not.toBeNull();
    // No orphan review row pointing at an id that was never inserted.
    const orphanBlogs = await col(db, "moderationReviews").countDocuments({
      contentType: "blog",
      contentId: { $nin: [blog.blogId] },
    } as never);
    expect(orphanBlogs).toBe(0);

    // --- study material ---------------------------------------------------
    const material = await createStudyMaterial(db, author, {
      title: "Unit 3 worksheet",
      description: "Algebra practice sheet",
      subject: "Mathematics",
      classGrade: "Grade 10",
      materialType: "worksheet",
      bucket: "study-materials",
      key: "worksheet.pdf",
      url: "/api/files/study-materials/worksheet.pdf",
      mime: "application/pdf",
      size: 4096,
      fileName: "worksheet.pdf",
      tags: ["algebra"],
    });
    expect(material.ok).toBe(true);
    if (!material.ok) return;
    const materialReview = await col(db, "moderationReviews").findOne({
      contentType: "post",
      contentId: material.materialId,
    } as never);
    expect(materialReview).not.toBeNull();
    const orphanMaterials = await col(db, "moderationReviews").countDocuments({
      contentType: "post",
      contentId: { $nin: [material.materialId] },
    } as never);
    expect(orphanMaterials).toBe(0);
  });
});
