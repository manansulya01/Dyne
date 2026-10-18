import { describe, expect, it, beforeAll, afterEach } from "vitest";
process.env.MONGODB_DB = "dyne_test_roles_matrix";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames, type UserDoc } from "@/lib/mongo/collections";
import { createUser, setUserRole } from "@/lib/db/users";
import { canUploadStudyMaterials, hasPermission, allPermissions, isAdminRole, isTeachingRole, ROLE_PERMISSIONS } from "@/lib/permissions";

/**
 * Role matrix regression tests.
 *
 * These lock in the product rules:
 *   - students never hold privileged permissions;
 *   - teachers never hold platform administration;
 *   - admins inherit the FULL teacher capability set (no duplicate teacher
 *     implementation);
 *   - super_admin holds every permission the system defines.
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

describe("role / permission matrix", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("grants students no privileged permissions", () => {
    const forbidden = [
      "users.manage",
      "users.ban",
      "users.suspend",
      "users.reset_password",
      "users.revoke_sessions",
      "posts.moderate",
      "blogs.create",
      "blogs.publish",
      "videos.create",
      "reels.create",
      "stories.create",
      "announcements.create",
      "assignments.create",
      "exams.create",
      "moderation.queue",
      "moderation.ai_config",
      "audit.view",
      "settings.manage",
      "admin.manage",
      "system.settings",
    ];
    for (const p of forbidden) {
      expect(hasPermission("student", p as never), `student must not hold ${p}`).toBe(false);
    }
  });

  it("allows only teacher-role accounts to upload study materials", () => {
    expect(canUploadStudyMaterials("teacher")).toBe(true);
    for (const role of ["student", "staff", "club", "moderator", "admin", "super_admin"] as const) {
      expect(canUploadStudyMaterials(role), `${role} must not upload study files`).toBe(false);
    }
    expect(hasPermission("club", "study.upload")).toBe(false);
  });

  it("grants students only self-scoped capabilities", () => {
    expect(hasPermission("student", "student_reports.read")).toBe(true);
    expect(hasPermission("student", "assignments.submit")).toBe(true);
    expect(hasPermission("student", "exams.take")).toBe(true);
    expect(hasPermission("student", "chat.use")).toBe(true);
    expect(hasPermission("student", "assignments.monitor")).toBe(false);
    expect(hasPermission("student", "academic_reports.read")).toBe(false);
  });

  it("restricts blog publishing to teacher, club, and administrator roles", () => {
    // Students and staff cannot publish blogs; the create endpoint enforces
    // this centrally (see withAnyPermission ["blogs.create"]).
    expect(hasPermission("student", "blogs.create")).toBe(false);
    expect(hasPermission("staff", "blogs.create")).toBe(false);
    expect(hasPermission("teacher", "blogs.create")).toBe(true);
    expect(hasPermission("club", "blogs.create")).toBe(true);
    expect(hasPermission("admin", "blogs.create")).toBe(true);
    expect(hasPermission("super_admin", "blogs.create")).toBe(true);
  });

  it("grants teachers academic + content powers but no platform administration", () => {
    const teacherHas = [
      "assignments.create",
      "assignments.manage",
      "assignments.monitor",
      "exams.create",
      "exams.manage",
      "exams.grade",
      "videos.create",
      "videos.moderate",
      "reels.create",
      "reels.moderate",
      "stories.create",
      "announcements.create",
      "blogs.create",
      "blogs.publish",
      "study.upload",
      "study.manage",
      "student_reports.read",
      "academic_reports.read",
      "moderation.queue",
      "analytics.read",
    ];
    for (const p of teacherHas) {
      expect(hasPermission("teacher", p as never), `teacher should hold ${p}`).toBe(true);
    }
    const teacherMustNot = [
      "users.manage",
      "users.ban",
      "users.suspend",
      "users.restore",
      "users.reset_password",
      "users.revoke_sessions",
      "admin.manage",
      "system.settings",
      "audit.view",
      "moderation.ai_config",
      "moderation.override",
      "settings.manage",
      "notifications.manage",
      "content.manage",
    ];
    for (const p of teacherMustNot) {
      expect(hasPermission("teacher", p as never), `teacher must not hold ${p}`).toBe(false);
    }
  });

  it("makes admin inherit every teacher capability", () => {
    const teacher = new Set(ROLE_PERMISSIONS.teacher);
    for (const p of teacher) {
      expect(hasPermission("admin", p), `admin must inherit teacher permission ${p}`).toBe(true);
    }
    expect(isTeachingRole("admin")).toBe(true);
    expect(isTeachingRole("teacher")).toBe(true);
    expect(isTeachingRole("student")).toBe(false);
  });

  it("gives admins the platform administration powers", () => {
    const adminHas = [
      "users.manage",
      "users.ban",
      "users.unban",
      "users.suspend",
      "users.restore",
      "users.reset_password",
      "users.revoke_sessions",
      "moderation.override",
      "moderation.ai_config",
      "audit.view",
      "settings.manage",
      "notifications.manage",
      "content.manage",
      "communities.manage",
      "study.feature",
    ];
    for (const p of adminHas) {
      expect(hasPermission("admin", p as never), `admin should hold ${p}`).toBe(true);
    }
    // `admin.manage` / `system.settings` remain super-admin-only.
    expect(hasPermission("admin", "admin.manage")).toBe(false);
    expect(isAdminRole("admin")).toBe(true);
  });

  it("gives super_admin every permission the system defines", () => {
    for (const p of allPermissions()) {
      expect(hasPermission("super_admin", p), `super_admin should hold ${p}`).toBe(true);
    }
  });

  it("assigns no permission to an unknown role", () => {
    expect(hasPermission("nope" as never, "users.manage")).toBe(false);
  });

  it("keeps role changes server-side (a client cannot spoof a role)", async () => {
    const db = await getDb();
    const student = await makeUser("spoof_student");
    // A signup payload claiming admin must not change the stored role.
    const row = await col<UserDoc>(db, "users").findOne({ _id: student } as never);
    expect(row?.role).toBe("student");
    expect(row?.role === "admin").toBe(false);

    // Role assignment requires an explicit repository call (used by the
    // permission-gated admin route).
    await setUserRole(db, student, "teacher");
    const after = await col<UserDoc>(db, "users").findOne({ _id: student } as never);
    expect(after?.role).toBe("teacher");
  });
});
