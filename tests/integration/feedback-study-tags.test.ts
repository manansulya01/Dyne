import { describe, expect, it, beforeAll, afterEach } from "vitest";
process.env.MONGODB_DB = "dyne_test_feedback_study";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser } from "@/lib/db/users";
import { createFeedback, listFeedback, updateFeedbackAdmin } from "@/lib/db/feedback";
import { createStudyMaterial, listStudyMaterials, moderateStudyMaterial, saveStudyMaterial, unsaveStudyMaterial, isStudyMaterialSaved } from "@/lib/db/studyMaterials";
import { createCommunityPost, listCommunityFeed } from "@/lib/db/communities";
import { createCommunity, joinCommunity } from "@/lib/db/communities";
import { sanitizeProfileTags, isValidProfileTag } from "@/lib/constants/profileTags";
import { updateOwnProfile } from "@/lib/db/users";

async function makeUser(username: string) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  return r.userId;
}

describe("feedback system", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("creates feedback and tracks status lifecycle", async () => {
    const db = await getDb();
    const u = await makeUser("fb_u1");
    const c = await createFeedback(db, u, { title: "Login bug", description: "Login fails on iPad Safari", category: "bug", page: "/login" });
    expect(c.ok).toBe(true);
    const mine = await listFeedback(db, u, "student");
    expect(mine.items).toHaveLength(1);
    expect(mine.isStaff).toBe(false);
    // Ordinary users cannot self-escalate status.
    expect(await updateFeedbackAdmin(db, c.feedbackId, "student", { status: "RESOLVED" })).toEqual({
      ok: false, reason: "forbidden",
    });
    // Staff workflow.
    for (const s of ["REVIEWING", "PLANNED", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const) {
      expect((await updateFeedbackAdmin(db, c.feedbackId, "admin", { status: s })).ok).toBe(true);
    }
  });

  it("prevents users from modifying someone else's feedback and hides internal notes", async () => {
    const db = await getDb();
    const a = await makeUser("fb_a");
    const b = await makeUser("fb_b");
    const c = await createFeedback(db, a, { title: "Idea", description: "Add dark mode toggle please", category: "feature" });
    await updateFeedbackAdmin(db, c.feedbackId, "admin", { internalNotes: "secret staffing note" });
    const asB = await listFeedback(db, b, "student");
    expect(asB.items).toHaveLength(0); // users only see their own
    const asA = await listFeedback(db, a, "student");
    const row = asA.items[0] as unknown as Record<string, unknown>;
    expect(row.internalNotes).toBeUndefined();
    expect(row.internal_notes).toBeUndefined();
  });
});

describe("study materials", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  function mat(over: Record<string, unknown> = {}) {
    return {
      title: "Physics Notes Ch 3",
      description: "Laws of motion",
      subject: "Physics",
      classGrade: "10-A",
      topic: "Motion",
      materialType: "notes" as const,
      tags: ["motion", "class10"],
      bucket: "study-materials",
      key: "uploader1/abc123.pdf",
      url: "/api/files/study-materials/uploader1/abc123.pdf",
      mime: "application/pdf",
      size: 1024,
      fileName: "notes.pdf",
      ...over,
    };
  }

  it("uploads, lists, filters, and moderates materials", async () => {
    const db = await getDb();
    const u = await makeUser("sm_u1");
    const c = await createStudyMaterial(db, u, mat());
    if (!c.ok) throw new Error("setup failed");
    expect(await listStudyMaterials(db, { subject: "Physics" })).toHaveLength(1);
    expect(await listStudyMaterials(db, { subject: "Chemistry" })).toHaveLength(0);
    expect(await listStudyMaterials(db, { search: "motion" })).toHaveLength(1);
    expect(await listStudyMaterials(db, { materialType: "notes" })).toHaveLength(1);
    // Moderation: remove hides from default listing; restore brings back.
    expect((await moderateStudyMaterial(db, c.materialId, "student", "remove")).ok).toBe(false);
    expect((await moderateStudyMaterial(db, c.materialId, "moderator", "remove")).ok).toBe(true);
    expect(await listStudyMaterials(db, {})).toHaveLength(0);
    expect((await moderateStudyMaterial(db, c.materialId, "moderator", "restore")).ok).toBe(true);
    expect(await listStudyMaterials(db, {})).toHaveLength(1);
  });

  it("rejects malicious keys, wrong buckets, and path traversal", async () => {
    const db = await getDb();
    const u = await makeUser("sm_u2");
    expect((await createStudyMaterial(db, u, mat({ key: "../../etc/passwd" }))).ok).toBe(false);
    expect((await createStudyMaterial(db, u, mat({ key: "/abs/path.pdf" }))).ok).toBe(false);
    expect((await createStudyMaterial(db, u, mat({ bucket: "avatars" }))).ok).toBe(false);
  });

  it("only privileged roles can feature materials", async () => {
    const db = await getDb();
    const u = await makeUser("sm_u3");
    const c = await createStudyMaterial(db, u, mat());
    if (!c.ok) throw new Error("setup failed");
    expect((await moderateStudyMaterial(db, c.materialId, "moderator", "feature")).ok).toBe(false);
    expect((await moderateStudyMaterial(db, c.materialId, "admin", "feature")).ok).toBe(true);
  });

  it("stores teacher/semester/year metadata, filters, sorts, and saves", async () => {
    const db = await getDb();
    const u = await makeUser("sm_u4");
    const v = await makeUser("sm_u5");
    const a = await createStudyMaterial(db, u, mat({
      title: "Algebra Basics", subject: "Math", teacher: "Ms Rao",
      semester: "Sem 1", academicYear: "2026-27", key: "u/a.pdf",
      url: "/api/files/study-materials/u/a.pdf",
    }));
    const b = await createStudyMaterial(db, u, mat({
      title: "Geometry Proofs", subject: "Math", teacher: "Mr Iyer",
      key: "u/b.pdf", url: "/api/files/study-materials/u/b.pdf",
    }));
    if (!a.ok || !b.ok) throw new Error("setup failed");
    expect(await listStudyMaterials(db, { teacher: "Ms Rao" })).toHaveLength(1);
    expect(await listStudyMaterials(db, { semester: "Sem 1" })).toHaveLength(1);
    expect(await listStudyMaterials(db, { academicYear: "2026-27" })).toHaveLength(1);
    const oldest = await listStudyMaterials(db, { sort: "oldest" });
    expect(String((oldest[0] as unknown as Record<string, unknown>).title)).toBe("Algebra Basics");
    // Save flow: save, idempotent re-save, saved-only listing, unsave.
    expect((await saveStudyMaterial(db, v, a.materialId)).ok).toBe(true);
    expect((await saveStudyMaterial(db, v, a.materialId)).ok).toBe(true);
    expect(await isStudyMaterialSaved(db, v, a.materialId)).toBe(true);
    expect(await isStudyMaterialSaved(db, v, b.materialId)).toBe(false);
    expect(await listStudyMaterials(db, { savedBy: v })).toHaveLength(1);
    await unsaveStudyMaterial(db, v, a.materialId);
    expect(await isStudyMaterialSaved(db, v, a.materialId)).toBe(false);
    expect(await listStudyMaterials(db, { savedBy: v })).toHaveLength(0);
    // Cannot save removed content.
    expect((await moderateStudyMaterial(db, b.materialId, "admin", "remove")).ok).toBe(true);
    expect(await saveStudyMaterial(db, v, b.materialId)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("profile tags", () => {  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("validates tags against the allow-list only", async () => {
    expect(isValidProfileTag("TECH")).toBe(true);
    expect(isValidProfileTag("nope")).toBe(false);
    expect(sanitizeProfileTags(["TECH", "sports", "HACK<script>", "TECH"])).toEqual(["TECH", "SPORTS"]);
    const db = await getDb();
    const u = await makeUser("tag_u1");
    const updated = await updateOwnProfile(db, u, { profileTags: ["TECH", "MUSIC", "EVIL"] });
    expect((updated?.profileTags ?? [])).toEqual(["TECH", "MUSIC"]);
  });
});

describe("community discussion feed", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("shows latest posts from joined communities only", async () => {
    const db = await getDb();
    const owner = await makeUser("cf_o");
    const member = await makeUser("cf_m");
    const stranger = await makeUser("cf_s");
    const c1 = await createCommunity(db, owner, { name: "Feed One", slug: "feed-one", isPrivate: false });
    const c2 = await createCommunity(db, owner, { name: "Feed Two", slug: "feed-two", isPrivate: false });
    if (!c1.ok || !c2.ok) throw new Error("setup failed");
    expect((await joinCommunity(db, c1.communityId, member)).ok).toBe(true);
    expect((await createCommunityPost(db, c1.communityId, owner, "hello one")).ok).toBe(true);
    expect((await createCommunityPost(db, c2.communityId, owner, "hello two")).ok).toBe(true);
    const feed = await listCommunityFeed(db, member, 20);
    expect(feed).toHaveLength(1);
    expect((feed[0] as unknown as Record<string, unknown>).content).toBe("hello one");
    expect(
      ((feed[0] as unknown as Record<string, unknown>).community as Record<string, unknown>).slug
    ).toBe("feed-one");
    expect(await listCommunityFeed(db, stranger, 20)).toHaveLength(0);
  });
});
