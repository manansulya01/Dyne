import { describe, expect, it, beforeAll, afterEach } from "vitest";
process.env.MONGODB_DB = "dyne_test_student_reports";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames, type UserDoc } from "@/lib/mongo/collections";
import { createUser, setUserRole } from "@/lib/db/users";
import {
  authorizeReportAccess,
  buildStudentReport,
  reportableStudents,
} from "@/lib/db/studentReports";
import { createTeacherAssignment } from "@/lib/db/teacherAssignments";
import { submitAssignment } from "@/lib/db/teacherAssignments";
import { createPost } from "@/lib/db/posts";
import { createCommunity, joinCommunity } from "@/lib/db/communities";

/**
 * Student report privacy + data honesty.
 *
 * Rules under test:
 *   - a student may only read their own report;
 *   - a teacher may only read students in a class they actually teach;
 *   - an admin may read any student;
 *   - missing data is reported as "no data" (null), never invented.
 */

async function makeUser(
  username: string,
  role?: UserDoc["role"],
  classGrade: string | null = null
) {
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

describe("student reports", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("lets a student read only their own report", async () => {
    const db = await getDb();
    const me = await makeUser("rep_me", "student", "Grade 9");
    const other = await makeUser("rep_other", "student", "Grade 9");

    const self = await authorizeReportAccess(db, { id: me.toHexString(), role: "student" }, me);
    expect(self.ok && self.scope).toBe("self");

    const denied = await authorizeReportAccess(db, { id: me.toHexString(), role: "student" }, other);
    expect(denied.ok).toBe(false);
    // 403, not 404: the student exists but is not the caller's own.
    expect(denied.ok === false && denied.status).toBe(403);
  });

  it("lets a teacher read only students in a class they teach", async () => {
    const db = await getDb();
    const teacher = await makeUser("rep_teacher", "teacher");
    const taught = await makeUser("rep_taught", "student", "Grade 9");
    const untouched = await makeUser("rep_untouched", "student", "Grade 12");

    // Before the teacher has any academic content, nobody is in scope.
    let access = await authorizeReportAccess(db, { id: teacher.toHexString(), role: "teacher" }, taught);
    expect(access.ok).toBe(false);

    await createTeacherAssignment(db, teacher, {
      title: "Taught assignment",
      subject: "Math",
      classGrade: "Grade 9",
      status: "published",
    });

    access = await authorizeReportAccess(db, { id: teacher.toHexString(), role: "teacher" }, taught);
    expect(access.ok && access.scope).toBe("taught");

    const denied = await authorizeReportAccess(db, { id: teacher.toHexString(), role: "teacher" }, untouched);
    expect(denied.ok).toBe(false);
    expect(denied.ok === false && denied.status).toBe(403);
  });

  it("lets an admin read any student", async () => {
    const db = await getDb();
    const admin = await makeUser("rep_admin", "admin");
    const student = await makeUser("rep_any", "student", "Grade 1");
    const access = await authorizeReportAccess(db, { id: admin.toHexString(), role: "admin" }, student);
    expect(access.ok && access.scope).toBe("admin");
  });

  it("returns 404 for an unknown student rather than leaking existence", async () => {
    const db = await getDb();
    const teacher = await makeUser("rep_missing", "teacher");
    const access = await authorizeReportAccess(
      db,
      { id: teacher.toHexString(), role: "teacher" },
      "0123456789abcdef01234567"
    );
    expect(access.ok).toBe(false);
    expect(access.ok === false && access.status).toBe(404);
  });

  it("never reports a non-student as a reportable student", async () => {
    const db = await getDb();
    const admin = await makeUser("rep_nonstudent", "admin");
    const teacher = await makeUser("rep_teacher_row", "teacher", "Grade 9");
    const access = await authorizeReportAccess(db, { id: admin.toHexString(), role: "admin" }, teacher);
    expect(access.ok).toBe(false);
    expect(access.ok === false && access.status).toBe(404);
  });

  it("reports real academic numbers and 'no data' where Dyne has none", async () => {
    const db = await getDb();
    const teacher = await makeUser("rep_data_teacher", "teacher");
    const student = await makeUser("rep_data_student", "student", "Grade 9");
    const absent = await makeUser("rep_data_absent", "student", "Grade 9");

    const assignment = await createTeacherAssignment(db, teacher, {
      title: "Report assignment",
      subject: "Math",
      classGrade: "Grade 9",
      status: "published",
      dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      maxMarks: 20,
    });
    if (!assignment.ok) throw new Error("setup failed");
    await submitAssignment(db, { assignmentId: assignment.assignmentId, studentId: student });

    const report = await buildStudentReport(db, student, "admin");
    expect(report).not.toBeNull();
    const data = report!.academic.classAssignments;
    expect(data.available).toBe(true);
    expect(data.data?.assigned).toBe(1);
    expect(data.data?.completed).toBe(1);
    expect(data.data?.completionRate).toBe(100);

    // Sections with no data are explicitly unavailable, never zero-filled.
    expect(report!.academic.goals.available).toBe(false);
    expect(report!.academic.goals.data).toBeNull();
    expect(report!.academic.habits.available).toBe(false);
    expect(report!.academic.habits.data).toBeNull();
    expect(report!.academic.studySessions.available).toBe(false);
    expect(report!.academic.studySessions.data).toBeNull();
    expect(report!.academic.exams.available).toBe(false);
    expect(report!.academic.exams.data).toBeNull();
    expect(report!.usage.posts.available).toBe(false);

    // A student who did nothing has the same "no data" honesty.
    const absentReport = await buildStudentReport(db, absent, "admin");
    expect(absentReport?.academic.classAssignments.data?.completed).toBe(0);
    // The observation reflects the real state: an assignment exists, nothing
    // was submitted for it.
    expect(absentReport?.observations).toContain(
      "No published assignment has been submitted yet."
    );
  });

  it("summarises real usage activity", async () => {
    const db = await getDb();
    const student = await makeUser("rep_usage", "student", "Grade 9");
    const owner = await makeUser("rep_usage_owner");
    await createPost(db, { authorId: student, content: "hello campus" });
    await createPost(db, { authorId: student, content: "second post" });
    const community = await createCommunity(db, owner, { name: "Report Club", slug: "report-club" });
    if (!community.ok) throw new Error("setup failed");
    await joinCommunity(db, community.communityId, student);

    const report = await buildStudentReport(db, student, "self");
    expect(report?.usage.posts.data?.total).toBe(2);
    expect(report?.usage.posts.data?.last30Days).toBe(2);
    expect(report?.usage.communities.available).toBe(true);
    expect(report?.usage.communities.data?.total).toBe(1);
    expect(report?.usage.communities.data?.items[0].name).toBe("Report Club");
    // Nothing exists for reels/videos, so those sections say "no data".
    expect(report?.usage.reelsWatched.available).toBe(false);
    expect(report?.usage.reelsCreated.available).toBe(false);
    expect(report?.usage.groupMessages.available).toBe(false);
  });

  it("reflects account status honestly", async () => {
    const db = await getDb();
    const student = await makeUser("rep_status", "student", "Grade 9");
    let report = await buildStudentReport(db, student, "self");
    expect(report?.student.account_status).toBe("active");

    await col<UserDoc>(db, "users").updateOne(
      { _id: student } as never,
      { $set: { suspendedUntil: new Date(Date.now() + 3600_000) } }
    );
    report = await buildStudentReport(db, student, "self");
    expect(report?.student.account_status).toBe("suspended");

    await col<UserDoc>(db, "users").updateOne(
      { _id: student } as never,
      { $set: { bannedAt: new Date() } }
    );
    report = await buildStudentReport(db, student, "self");
    expect(report?.student.account_status).toBe("banned");
  });

  it("scopes the student list to authorized classes", async () => {
    const db = await getDb();
    const teacher = await makeUser("rep_list_teacher", "teacher");
    const mine = await makeUser("rep_list_mine", "student", "Grade 7");
    const theirs = await makeUser("rep_list_theirs", "student", "Grade 8");
    await createTeacherAssignment(db, teacher, {
      title: "Grade 7 work",
      subject: "Art",
      classGrade: "Grade 7",
      status: "published",
    });

    const result = await reportableStudents(db, { id: teacher.toHexString(), role: "teacher" });
    const ids = result.students.map((s) =>
      String((s as unknown as { _id: { toHexString(): string } })._id.toHexString())
    );
    expect(ids).toContain(mine.toHexString());
    expect(ids).not.toContain(theirs.toHexString());
    expect(result.taughtClasses).toEqual(["Grade 7"]);

    const adminResult = await reportableStudents(db, { id: "0".repeat(24), role: "admin" });
    const adminIds = adminResult.students.map((s) =>
      String((s as unknown as { _id: { toHexString(): string } })._id.toHexString())
    );
    expect(adminIds).toContain(theirs.toHexString());
    expect(adminIds).toContain(mine.toHexString());
  });

  it("never leaks report data through profiles or search", async () => {
    const db = await getDb();
    const student = await makeUser("rep_private", "student", "Grade 9");
    const { globalSearch } = await import("@/lib/db/search");
    const results = await globalSearch(db, "rep_private");
    const serialized = JSON.stringify(results);
    // Search returns only the public people shape — no academic data.
    expect(serialized).not.toContain("completionRate");
    expect(serialized).not.toContain("studySessions");
    expect(serialized).not.toContain("assignments");

    const { toProfileJSON } = await import("@/lib/db/contracts");
    const row = await col<UserDoc>(db, "users").findOne({ _id: student } as never);
    const profile = toProfileJSON(row as unknown as Record<string, unknown>);
    expect(Object.keys(profile).sort()).toEqual(
      [
        "accent", "avatar_url", "bio", "class_grade", "cover_image_url", "created_at",
        "display_name", "house", "id", "interests", "profile_tags", "role", "updated_at",
        "username",
      ].sort()
    );
  });

  it("resists ObjectId / NoSQL injection in the id parameter", async () => {
    const db = await getDb();
    const teacher = await makeUser("rep_inject", "teacher");
    for (const bad of ["", "null", "true", '{"$ne":null}', "'; drop", "../../etc"]) {
      const access = await authorizeReportAccess(db, { id: teacher.toHexString(), role: "teacher" }, bad);
      expect(access.ok, `id "${bad}" must not be accepted`).toBe(false);
    }
    // A forged admin payload cannot change the caller's scope.
    const student = await makeUser("rep_inject_student", "student", "Grade 9");
    const forged = await authorizeReportAccess(
      db,
      { id: student.toHexString(), role: "admin" } as never,
      student
    );
    // The forged role is only used after the self check, so this still resolves
    // to "self" — never to an admin-scoped read of somebody else.
    expect(forged.ok && forged.scope).toBe("self");
  });
});