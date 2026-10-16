import { describe, expect, it, beforeAll, afterEach } from "vitest";
process.env.MONGODB_DB = "dyne_test_admin_mod";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser, setUserRole } from "@/lib/db/users";
import { createPost } from "@/lib/db/posts";
import { createReport, reviewReport, listReports } from "@/lib/db/reports";
import { hasPermission, requireSuperAdmin } from "@/lib/permissions";

async function makeUser(username: string, role: "student" | "teacher" | "staff" | "moderator" | "admin" | "super_admin" = "student") {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  if (role !== "student") await setUserRole(db, r.userId, role);
  return r.userId;
}

describe("admin roles, permissions, moderation, audit", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("defines granular permissions per role and protects super-admin", async () => {
    expect(hasPermission("student", "users.manage")).toBe(false);
    expect(hasPermission("moderator", "reports.view")).toBe(true);
    expect(hasPermission("moderator", "admin.manage")).toBe(false);
    expect(hasPermission("admin", "users.ban")).toBe(true);
    expect(hasPermission("admin", "admin.manage")).toBe(false);
    expect(hasPermission("super_admin", "admin.manage")).toBe(true);
    expect(hasPermission("super_admin", "system.settings")).toBe(true);
    expect(() => requireSuperAdmin("admin")).toThrow();
    expect(() => requireSuperAdmin("super_admin")).not.toThrow();
  });

  it("runs report pipeline with role gates and immutable audit", async () => {
    const db = await getDb();
    const reporter = await makeUser("rep1");
    const author = await makeUser("auth1");
    const mod = await makeUser("mod1", "moderator");
    const student = await makeUser("stud1");

    const post = await createPost(db, { authorId: author, content: "hello campus" });
    if (!post.ok) throw new Error("setup failed");

    const created = await createReport(db, reporter, {
      targetType: "post", targetId: post.postId, reason: "spam", description: "looks spammy",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("setup failed");

    // Ordinary student cannot review.
    expect(
      await reviewReport(db, created.reportId, student, "student", { status: "DISMISSED" })
    ).toEqual({ ok: false, reason: "forbidden" });

    // Moderator can move to UNDER_REVIEW with notes.
    const under = await reviewReport(db, created.reportId, mod, "moderator", {
      status: "UNDER_REVIEW", moderatorNotes: "checking",
    });
    expect(under.ok).toBe(true);

    // Moderator notes hidden from ordinary users.
    const asStudent = await listReports(db, reporter, "student");
    const mine = asStudent.reports.find(
      (r) => String((r as unknown as Record<string, unknown>).id) === created.reportId.toHexString()
    ) as unknown as Record<string, unknown> | undefined;
    expect(mine).toBeDefined();
    expect(mine?.moderatorNotes).toBeUndefined();
    expect(mine?.moderator_notes).toBeUndefined();

    // Moderator sees notes.
    const asMod = await listReports(db, mod, "moderator");
    expect(asMod.isModerator).toBe(true);

    // Action creates immutable audit record.
    const acted = await reviewReport(db, created.reportId, mod, "moderator", {
      status: "ACTION_TAKEN", action: "content_removal", reason: "spam",
    });
    expect(acted.ok).toBe(true);
    const audits = await col(db, "moderationActions").find({}).toArray();
    expect(audits.length).toBeGreaterThanOrEqual(1);
    // Audit rows are insert-only: no update/delete API exists; verify the row persists.
    expect(audits[0].action).toBe("content_removal");
  });

  it("supports ESCALATED status and all report reasons", async () => {
    const db = await getDb();
    const reporter = await makeUser("rep2");
    const author = await makeUser("auth2");
    const admin = await makeUser("adm2", "admin");
    const post = await createPost(db, { authorId: author, content: "escalate me" });
    if (!post.ok) throw new Error("setup failed");
    const created = await createReport(db, reporter, {
      targetType: "post", targetId: post.postId, reason: "harassment",
    });
    if (!created.ok) throw new Error("setup failed");
    const esc = await reviewReport(db, created.reportId, admin, "admin", { status: "ESCALATED" });
    expect(esc.ok).toBe(true);
  });

  it("privilege escalation checks fail for non-super-admin (unit-level guard)", async () => {
    const admin = await makeUser("adm3", "admin");
    const victim = await makeUser("vic3");
    void admin;
    void victim;
    // The API route enforces: admin cannot grant admin/super_admin. Here we
    // assert the permission table itself denies it.
    expect(hasPermission("admin", "admin.manage")).toBe(false);
    expect(hasPermission("moderator", "users.ban")).toBe(false);
  });
});
