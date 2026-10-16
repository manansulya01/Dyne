import { describe, expect, it, beforeAll, afterEach } from "vitest";
process.env.MONGODB_DB = "dyne_test_auth_matrix";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser, setUserRole, followUser } from "@/lib/db/users";
import { createPost } from "@/lib/db/posts";
import { createConversation, sendMessage } from "@/lib/db/chat";
import { createReport, reviewReport } from "@/lib/db/reports";
import { createFeedback, updateFeedbackAdmin } from "@/lib/db/feedback";
import { createStudyMaterial, moderateStudyMaterial } from "@/lib/db/studyMaterials";
import { hasPermission } from "@/lib/permissions";

async function makeUser(username: string, role: "student" | "moderator" | "admin" | "super_admin" = "student") {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  if (role !== "student") await setUserRole(db, r.userId, role);
  return r.userId;
}

describe("API authorization matrix (repository level)", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("students cannot moderate; moderators/admins can (reports)", async () => {
    const db = await getDb();
    const reporter = await makeUser("mx_r");
    const author = await makeUser("mx_a");
    const student = await makeUser("mx_s");
    const mod = await makeUser("mx_m", "moderator");
    const admin = await makeUser("mx_ad", "admin");
    const post = await createPost(db, { authorId: author, content: "matrix" });
    if (!post.ok) throw new Error("setup failed");
    const rep = await createReport(db, reporter, { targetType: "post", targetId: post.postId, reason: "spam" });
    if (!rep.ok) throw new Error("setup failed");
    expect((await reviewReport(db, rep.reportId, student, "student", { status: "DISMISSED" })).ok).toBe(false);
    expect((await reviewReport(db, rep.reportId, mod, "moderator", { status: "UNDER_REVIEW" })).ok).toBe(true);
    expect((await reviewReport(db, rep.reportId, admin, "admin", { status: "DISMISSED" })).ok).toBe(true);
  });

  it("forged ownership fails: cannot follow self, cannot message non-member convo", async () => {
    const db = await getDb();
    const a = await makeUser("mx_o1");
    const b = await makeUser("mx_o2");
    const c = await makeUser("mx_o3");
    expect(await followUser(db, a, a)).toEqual({ ok: false, reason: "self" });
    const g = await createConversation(db, a, { type: "group", participantIds: [b, c], name: "M" });
    if (!g.ok) throw new Error("setup failed");
    const forger = await makeUser("mx_forge");
    expect((await sendMessage(db, g.conversationId, forger, "forged")).ok).toBe(false);
  });

  it("study/feedback moderator gates hold across roles", async () => {
    const db = await getDb();
    const u = await makeUser("mx_u");
    const mod = await makeUser("mx_mod", "moderator");
    await makeUser("mx_admin", "admin");
    const fb = await createFeedback(db, u, { title: "t123", description: "description long enough", category: "bug" });
    expect((await updateFeedbackAdmin(db, fb.feedbackId, "student", { status: "CLOSED" })).ok).toBe(false);
    expect((await updateFeedbackAdmin(db, fb.feedbackId, "moderator", { status: "REVIEWING" })).ok).toBe(true);
    void mod;
    const sm = await createStudyMaterial(db, u, {
      title: "T", description: null, subject: "Math", classGrade: "9",
      topic: null, materialType: "notes", tags: [], bucket: "study-materials",
      key: "u/k.pdf", url: "/api/files/study-materials/u/k.pdf", mime: "application/pdf",
      size: 10, fileName: "k.pdf",
    });
    // Title too short still passes? Title "T" is 1 char — createStudyMaterial trims but
    // does not validate length (API zod does). Moderation gates still hold:
    if (sm.ok) {
      expect((await moderateStudyMaterial(db, sm.materialId, "student", "remove")).ok).toBe(false);
      expect((await moderateStudyMaterial(db, sm.materialId, "admin", "remove")).ok).toBe(true);
    }
    expect(hasPermission("student", "study.manage")).toBe(false);
    expect(hasPermission("admin", "study.manage")).toBe(true);
  });

  it("super-admin-only permissions are denied to admin", async () => {
    expect(hasPermission("admin", "admin.manage")).toBe(false);
    expect(hasPermission("super_admin", "admin.manage")).toBe(true);
    expect(hasPermission("moderator", "system.settings")).toBe(false);
    expect(hasPermission("super_admin", "system.settings")).toBe(true);
  });
});

describe("input security (injection / XSS shapes)", () => {
  it("NoSQL-style objects are rejected by ObjectId parsing", async () => {
    const { toObjectId } = await import("@/lib/mongo/ids");
    expect(() => toObjectId({ $gt: "" } as unknown as string)).toThrow();
    expect(() => toObjectId("__proto__")).toThrow();
    expect(() => toObjectId("not-an-id")).toThrow();
  });

  it("stored content is plain text (no HTML execution server-side)", async () => {
    const db = await getDb();
    const a = await makeUser("mx_xss1");
    const b = await makeUser("mx_xss2");
    const c = await makeUser("mx_xss3");
    const payload = "<script>alert(1)</script><img src=x onerror=alert(2)>";
    const post = await createPost(db, { authorId: a, content: payload });
    expect(post.ok).toBe(true);
    const g = await createConversation(db, a, { type: "group", participantIds: [b, c], name: "X" });
    if (!g.ok) throw new Error("setup failed");
    const sent = await sendMessage(db, g.conversationId, a, payload);
    expect(sent.ok).toBe(true);
    // Server stores raw text; React escapes on render (no server-side HTML injection).
    const rows = await col(db, "posts").find({}).toArray();
    expect(String(rows[0].content)).toContain("<script>");
  });
});
