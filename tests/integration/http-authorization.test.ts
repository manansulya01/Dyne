import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
process.env.MONGODB_DB = "dyne_test_http_authz";

/**
 * Route-level authorization tests.
 *
 * These import the REAL route handlers and drive them with forged requests, so
 * the assertions cover the actual security boundary (authenticate → authorize →
 * validate) rather than a repository stand-in.
 *
 * The session cookie is supplied by mocking `next/headers`, which is exactly
 * what the browser would send.
 */

const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name) } : undefined,
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
  headers: async () => new Headers(),
}));

import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames, type UserDoc } from "@/lib/mongo/collections";
import { createUser, setUserRole } from "@/lib/db/users";
import { createSession, destroySession, SESSION_COOKIE } from "@/lib/auth/session";
import { createTeacherAssignment } from "@/lib/db/teacherAssignments";
import { createExam, publishExam, replaceQuestions, startAttempt, submitAttempt } from "@/lib/db/classExams";
import { createReel } from "@/lib/db/reels";
import { logAudit } from "@/lib/security/audit";
import { __resetRateLimitsForTests } from "@/lib/security/rateLimit";
import { toObjectId as oid } from "@/lib/mongo/ids";
import { ObjectId } from "mongodb";

const REEL_URL = "/api/files/reel-videos/http/reel.mp4";

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
    await col<UserDoc>(db, "users").updateOne({ _id: r.userId } as never, { $set: { classGrade } });
  }
  return r.userId;
}

/** Sign a user in for the mocked cookie jar. */
async function signIn(userId: string | ObjectId) {
  const db = await getDb();
  const { token } = await createSession(db, userId as ObjectId);
  cookieStore.set(SESSION_COOKIE, token);
  return token;
}

function signOut() {
  cookieStore.clear();
}

function json(url: string, init: RequestInit = {}) {
  return new Request(`http://localhost:3000${url}`, init);
}

/** A minimal but *genuine* MP4 signature, so byte sniffing accepts it. */
function videoFile(name = "clip.mp4") {
  const bytes = new Uint8Array([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    0x00, 0x00, 0x02, 0x00,
  ]);
  return new File([bytes], name, { type: "video/mp4" });
}

function multipart(bucket: string, file: File) {
  const body = new FormData();
  body.set("bucket", bucket);
  body.set("file", file);
  return new Request("http://localhost:3000/api/upload", { method: "POST", body });
}

describe("HTTP authorization matrix", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  beforeEach(() => {
    cookieStore.clear();
    __resetRateLimitsForTests();
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
    cookieStore.clear();
  });

  it("rejects every privileged route without a session (401)", async () => {
    const adminUsers = (await import("@/app/api/admin/users/route")).GET;
    const moderation = (await import("@/app/api/moderation/queue/route")).GET;
    const reels = (await import("@/app/api/reels/route")).POST;
    const assignments = (await import("@/app/api/class-assignments/route")).GET;
    const exams = (await import("@/app/api/class-exams/route")).GET;
    const reports = (await import("@/app/api/student-reports/route")).GET;
    const analytics = (await import("@/app/api/admin/analytics/route")).GET;

    signOut();
    expect((await adminUsers(json("/api/admin/users"))).status).toBe(401);
    expect((await moderation(json("/api/moderation/queue"))).status).toBe(401);
    expect((await reports(json("/api/student-reports"))).status).toBe(401);
    expect((await analytics()).status).toBe(401);
    expect(
      (await reels(json("/api/reels", { method: "POST", body: "{}" }))).status
    ).toBe(401);
    expect((await assignments(json("/api/class-assignments"))).status).toBe(401);
    expect((await exams(json("/api/class-exams"))).status).toBe(401);
  });

  it("rejects student access to teacher and admin routes (403)", async () => {
    const student = await makeUser("http_student", "student", "Grade 9");
    await signIn(student);

    const moderation = (await import("@/app/api/moderation/queue/route")).GET;
    const analytics = (await import("@/app/api/admin/analytics/route")).GET;
    const classAssignments = (await import("@/app/api/class-assignments/route")).GET;
    const classExams = (await import("@/app/api/class-exams/route")).GET;
    const reelsPost = (await import("@/app/api/reels/route")).POST;
    const adminUsers = (await import("@/app/api/admin/users/route")).GET;

    expect((await moderation(json("/api/moderation/queue"))).status).toBe(403);
    expect((await analytics()).status).toBe(403);
    expect((await classAssignments(json("/api/class-assignments"))).status).toBe(403);
    expect((await classExams(json("/api/class-exams"))).status).toBe(403);
    // Admin console directory is admin/teacher-moderation territory only.
    expect((await adminUsers(json("/api/admin/users"))).status).toBe(403);
    expect(
      (
        await reelsPost(
          json("/api/reels", {
            method: "POST",
            body: JSON.stringify({ title: "student reel", videoUrl: REEL_URL }),
          })
        )
      ).status
    ).toBe(403);
  });

  it("gates staff media buckets on the upload endpoint", async () => {
    const upload = (await import("@/app/api/upload/route")).POST;
    const uploadTo = (bucket: string) => upload(multipart(bucket, videoFile()));

    const student = await makeUser("http_upload_student", "student");
    await signIn(student);
    // A student may upload to their own media buckets…
    expect((await uploadTo("post-media")).status).toBe(200);
    // …but never into the buckets that back staff-only features.
    expect((await uploadTo("reel-videos")).status).toBe(403);
    expect((await uploadTo("watch-videos")).status).toBe(403);
    expect((await uploadTo("study-materials")).status).toBe(403);
    expect((await uploadTo("video-thumbnails")).status).toBe(403);

    const teacher = await makeUser("http_upload_teacher", "teacher");
    await signIn(teacher);
    expect((await uploadTo("reel-videos")).status).toBe(200);
    expect((await uploadTo("watch-videos")).status).toBe(200);
  });

  it("rejects teacher access to admin-only routes (403) but allows teacher work", async () => {
    const teacher = await makeUser("http_teacher", "teacher");
    await signIn(teacher);

    const adminUsers = (await import("@/app/api/admin/users/route")).GET;
    const analytics = (await import("@/app/api/admin/analytics/route")).GET;
    const userActions = (await import("@/app/api/admin/users/[id]/actions/route")).POST;
    expect((await adminUsers(json("/api/admin/users"))).status).toBe(403);

    // Teachers may read analytics, but ONLY their own teaching numbers:
    // platform-wide statistics must never leak to a teacher.
    const analyticsRes = await analytics();
    expect(analyticsRes.status).toBe(200);
    const teacherStats = (await analyticsRes.json()) as {
      scope: string;
      stats: Record<string, number>;
    };
    expect(teacherStats.scope).toBe("own");
    expect(Object.keys(teacherStats.stats)).toEqual([
      "myAssignments",
      "myExams",
      "myCommunities",
      "openReports",
      "activeSessions",
    ]);

    const target = await makeUser("http_target", "student", "Grade 9");
    const banned = await userActions(
      json(`/api/admin/users/${target.toHexString()}/actions`, {
        method: "POST",
        body: JSON.stringify({ userId: target.toHexString(), action: "ban", reason: "nope" }),
      })
    );
    expect(banned.status).toBe(403);

    // Teacher capabilities do work.
    const reelsPost = (await import("@/app/api/reels/route")).POST;
    const created = await reelsPost(
      json("/api/reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Teacher reel", videoUrl: REEL_URL }),
      })
    );
    expect(created.status).toBe(201);
    const classAssignments = (await import("@/app/api/class-assignments/route")).GET;
    expect((await classAssignments(json("/api/class-assignments"))).status).toBe(200);
  });

  it("lets an admin perform teacher operations and admin operations", async () => {
    const admin = await makeUser("http_admin", "admin");
    await signIn(admin);

    const reelsPost = (await import("@/app/api/reels/route")).POST;
    expect(
      (
        await reelsPost(
          json("/api/reels", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Admin reel", videoUrl: REEL_URL }),
          })
        )
      ).status
    ).toBe(201);

    const adminUsers = (await import("@/app/api/admin/users/route")).GET;
    const analytics = (await import("@/app/api/admin/analytics/route")).GET;
    expect((await adminUsers(json("/api/admin/users"))).status).toBe(200);
    expect((await analytics()).status).toBe(200);

    // Admin cannot grant admin/super_admin — that is super-admin-only.
    const target = await makeUser("http_promote", "student", "Grade 9");
    const patch = (await import("@/app/api/admin/users/route")).PATCH;
    const blocked = await patch(
      json("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: target.toHexString(), role: "admin" }),
      })
    );
    expect(blocked.status).toBe(403);
    // …and the escalation attempt is audited.
    expect(
      await col(await getDb(), "auditLogs").countDocuments({
        action: "admin.role.escalation_blocked",
      } as never)
    ).toBe(1);
  });

  it("ignores a client-supplied role in a signup-shaped payload", async () => {
    const db = await getDb();
    const student = await makeUser("http_role_spoof", "student", "Grade 9");
    await signIn(student);

    // The reels route authorizes from the session, not from the body.
    const reelsPost = (await import("@/app/api/reels/route")).POST;
    const res = await reelsPost(
      json("/api/reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Spoof attempt",
          videoUrl: REEL_URL,
          role: "admin",
          moderationStatus: "approved",
        }),
      })
    );
    expect(res.status).toBe(403);

    const row = await col<UserDoc>(db, "users").findOne({ _id: student } as never);
    expect(row?.role).toBe("student");
  });

  it("blocks IDOR on another student's report (403/404, never data)", async () => {
    const a = await makeUser("http_idor_a", "student", "Grade 9");
    const b = await makeUser("http_idor_b", "student", "Grade 9");
    await signIn(a);

    const get = (await import("@/app/api/student-reports/[id]/route")).GET;
    const own = await get(json(`/api/student-reports/${a.toHexString()}`), {
      params: Promise.resolve({ id: a.toHexString() }),
    });
    expect(own.status).toBe(200);
    const ownBody = (await own.json()) as { report: { student: { id: string } } };
    expect(ownBody.report.student.id).toBe(a.toHexString());

    const other = await get(json(`/api/student-reports/${b.toHexString()}`), {
      params: Promise.resolve({ id: b.toHexString() }),
    });
    expect(other.status).toBe(403);
    expect(JSON.stringify(await other.json())).not.toContain(b.toHexString());
  });

  it("blocks a teacher from reading a student outside their classes", async () => {
    const db = await getDb();
    const teacher = await makeUser("http_scope_teacher", "teacher");
    const taught = await makeUser("http_scope_taught", "student", "Grade 9");
    const other = await makeUser("http_scope_other", "student", "Grade 12");
    await createTeacherAssignment(db, teacher, {
      title: "Grade 9 only",
      subject: "Math",
      classGrade: "Grade 9",
      status: "published",
    });
    await signIn(teacher);

    const get = (await import("@/app/api/student-reports/[id]/route")).GET;
    const okRes = await get(json(`/api/student-reports/${taught.toHexString()}`), {
      params: Promise.resolve({ id: taught.toHexString() }),
    });
    expect(okRes.status).toBe(200);

    const denied = await get(json(`/api/student-reports/${other.toHexString()}`), {
      params: Promise.resolve({ id: other.toHexString() }),
    });
    expect(denied.status).toBe(403);
  });

  it("blocks IDOR on the assignment monitor and on class submissions", async () => {
    const db = await getDb();
    const owner = await makeUser("http_assign_owner", "teacher");
    const intruder = await makeUser("http_assign_intruder", "teacher");
    const outsider = await makeUser("http_assign_outsider", "student", "Grade 12");
    const created = await createTeacherAssignment(db, owner, {
      title: "Monitor target",
      subject: "Math",
      classGrade: "Grade 9",
      status: "published",
    });
    if (!created.ok) throw new Error("setup failed");

    const monitor = (await import("@/app/api/class-assignments/[id]/monitor/route")).GET;
    await signIn(owner);
    expect(
      (await monitor(json(`/api/class-assignments/${created.assignmentId}/monitor`), {
        params: Promise.resolve({ id: created.assignmentId.toHexString() }),
      })).status
    ).toBe(200);

    await signIn(intruder);
    expect(
      (await monitor(json(`/api/class-assignments/${created.assignmentId}/monitor`), {
        params: Promise.resolve({ id: created.assignmentId.toHexString() }),
      })).status
    ).toBe(403);

    // A student outside the class cannot submit.
    await signIn(outsider);
    const submit = (await import("@/app/api/class-assignments/[id]/submit/route")).POST;
    const refused = await submit(
      json(`/api/class-assignments/${created.assignmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "submitted" }),
      }),
      { params: Promise.resolve({ id: created.assignmentId.toHexString() }) }
    );
    expect(refused.status).toBe(403);
    expect(
      await col(db, "assignmentSubmissions").countDocuments({
        assignmentId: created.assignmentId,
      } as never)
    ).toBe(0);
  });

  it("never exposes another student's exam attempt", async () => {
    const db = await getDb();
    const teacher = await makeUser("http_exam_teacher", "teacher");
    const student = await makeUser("http_exam_student", "student", "Grade 9");
    const other = await makeUser("http_exam_other", "student", "Grade 9");
    const exam = await createExam(db, teacher, {
      title: "Private exam",
      subject: "Math",
      classGrade: "Grade 9",
      startsAt: new Date(Date.now() - 60_000),
      totalMarks: 10,
      passingMarks: 5,
    });
    if (!exam.ok) throw new Error("setup failed");
    await replaceQuestions(db, exam.examId, [
      {
        id: "q1",
        type: "mcq",
        prompt: "1 + 1?",
        marks: 2,
        difficulty: "easy",
        options: [
          { id: "a", text: "2", isCorrect: true },
          { id: "b", text: "3", isCorrect: false },
        ],
        pairs: [],
        correctAnswers: [],
        numericRange: null,
        explanation: null,
        attachmentUrl: null,
        caseStudyText: null,
      },
    ]);
    await publishExam(db, exam.examId);
    const started = await startAttempt(db, exam.examId, student);
    if (!started.ok) throw new Error("setup failed");
    await submitAttempt(db, {
      examId: exam.examId,
      studentId: student,
      attemptId: started.attemptId,
      answers: [
        { questionId: "q1", optionIds: ["a"], text: "", matchedPairs: [], numeric: null, fileUrl: null },
      ],
    });

    await signIn(other);
    const attempts = (await import("@/app/api/class-exams/[id]/attempts/route")).GET;
    const res = await attempts(json(`/api/class-exams/${exam.examId}/attempts`), {
      params: Promise.resolve({ id: exam.examId.toHexString() }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only the CALLER's attempts are returned.
    expect(body.attempts).toHaveLength(0);

    // Attempt grading detail is owner/admin only.
    const gradeRoute = (await import("@/app/api/class-exams/[id]/results/[attemptId]/route")).GET;
    const denied = await gradeRoute(
      json(`/api/class-exams/${exam.examId}/results/${started.attemptId}`),
      {
        params: Promise.resolve({
          id: exam.examId.toHexString(),
          attemptId: started.attemptId.toHexString(),
        }),
      }
    );
    expect(denied.status).toBe(403);
  });

  it("never returns correct answers to a student before results are released", async () => {
    const db = await getDb();
    const teacher = await makeUser("http_ans_teacher", "teacher");
    const student = await makeUser("http_ans_student", "student", "Grade 9");
    const exam = await createExam(db, teacher, {
      title: "Answer leak test",
      subject: "Math",
      classGrade: "Grade 9",
      startsAt: new Date(Date.now() - 60_000),
      totalMarks: 10,
      passingMarks: 5,
    });
    if (!exam.ok) throw new Error("setup failed");
    await replaceQuestions(db, exam.examId, [
      {
        id: "q1",
        type: "mcq",
        prompt: "Secret answer question",
        marks: 2,
        difficulty: "easy",
        options: [
          { id: "a", text: "right", isCorrect: true },
          { id: "b", text: "wrong", isCorrect: false },
        ],
        pairs: [],
        correctAnswers: [],
        numericRange: null,
        explanation: null,
        attachmentUrl: null,
        caseStudyText: null,
      },
    ]);
    await publishExam(db, exam.examId);

    await signIn(student);
    const get = (await import("@/app/api/class-exams/[id]/route")).GET;
    const res = await get(json(`/api/class-exams/${exam.examId}`), {
      params: Promise.resolve({ id: exam.examId.toHexString() }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const question = body.questions[0];
    expect(question.correct_option_ids).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("correct_option_ids");
    expect(JSON.stringify(body)).not.toContain("isCorrect");
  });

  it("blocks a forged report read for a non-existent student with 404", async () => {
    const student = await makeUser("http_404", "student", "Grade 9");
    await signIn(student);
    const get = (await import("@/app/api/student-reports/[id]/route")).GET;
    const res = await get(json("/api/student-reports/0123456789abcdef01234567"), {
      params: Promise.resolve({ id: "0123456789abcdef01234567" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects malformed ids with 404, not 500", async () => {
    await signIn(await makeUser("http_malformed", "admin"));
    const get = (await import("@/app/api/student-reports/[id]/route")).GET;
    for (const bad of ["null", '{"$ne":null}', "'; drop --", "undefined", "[]"]) {
      const res = await get(json(`/api/student-reports/${encodeURIComponent(bad)}`), {
        params: Promise.resolve({ id: bad }),
      });
      expect(res.status, `id ${bad} must not 500`).toBe(404);
    }
  });

  it("blocks unauthorized reel deletion and moderation of another user's reel", async () => {
    const db = await getDb();
    const owner = await makeUser("http_reel_owner", "teacher");
    const intruder = await makeUser("http_reel_intruder", "teacher");
    const created = await createReel(db, owner, { title: "Owned reel", videoUrl: REEL_URL });
    if (!created.ok) throw new Error("setup failed");

    await signIn(intruder);
    const del = (await import("@/app/api/reels/[id]/route")).DELETE;
    const refused = await del(json(`/api/reels/${created.reelId}`), {
      params: Promise.resolve({ id: created.reelId.toHexString() }),
    });
    expect(refused.status).toBe(403);

    await signIn(owner);
    const allowed = await del(json(`/api/reels/${created.reelId}`), {
      params: Promise.resolve({ id: created.reelId.toHexString() }),
    });
    expect(allowed.status).toBe(200);
  });

  it("hides held reels from other viewers (404) but shows them to the owner", async () => {
    const db = await getDb();
    const owner = await makeUser("http_held_owner", "teacher");
    const viewer = await makeUser("http_held_viewer");
    await db.collection("reels").insertOne({
      title: "Held",
      caption: null,
      videoUrl: REEL_URL,
      thumbnailUrl: null,
      creatorId: owner,
      durationSeconds: 10,
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
      moderationReason: "held",
      moderationScore: 0,
      moderationSource: "none",
      moderationProvider: null,
      moderationMediaAnalyzed: false,
      moderatedAt: new Date(),
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const heldId = (await db.collection("reels").findOne({ title: "Held" } as never))!._id as unknown as ObjectId;

    const get = (await import("@/app/api/reels/[id]/route")).GET;
    await signIn(viewer);
    const hidden = await get(json(`/api/reels/${heldId}`), {
      params: Promise.resolve({ id: heldId.toHexString() }),
    });
    expect(hidden.status).toBe(404);

    await signIn(owner);
    const visible = await get(json(`/api/reels/${heldId}`), {
      params: Promise.resolve({ id: heldId.toHexString() }),
    });
    expect(visible.status).toBe(200);
  });

  it("audits every privileged admin action", async () => {
    const db = await getDb();
    const admin = await makeUser("http_audit_admin", "admin");
    const target = await makeUser("http_audit_target", "student", "Grade 9");
    await signIn(admin);

    const actions = (await import("@/app/api/admin/users/[id]/actions/route")).POST;
    const suspend = await actions(
      json(`/api/admin/users/${target.toHexString()}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: target.toHexString(),
          action: "suspend",
          until: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      })
    );
    expect(suspend.status).toBe(200);

    const row = await col<UserDoc>(db, "users").findOne({ _id: target } as never);
    expect(row?.suspendedUntil).toBeTruthy();
    // Suspension revokes live sessions immediately.
    expect(
      await col(db, "sessions").countDocuments({ userId: target } as never)
    ).toBe(0);
    expect(
      await col(db, "auditLogs").countDocuments({ action: "admin.user.suspend" } as never)
    ).toBe(1);

    // …and the suspended user can no longer use the API.
    await signIn(target);
    const analytics = (await import("@/app/api/admin/analytics/route")).GET;
    expect((await analytics()).status).toBe(401);
  });

  it("never returns a password or reset token to the admin directory", async () => {
    const db = await getDb();
    const admin = await makeUser("http_pw_admin", "admin");
    const target = await makeUser("http_pw_target", "student", "Grade 9");
    await signIn(admin);

    const list = (await import("@/app/api/admin/users/route")).GET;
    const res = await list(json("/api/admin/users"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toMatch(/passwordHash/);
    expect(body).not.toContain("$2b$");
    expect(body).not.toContain("Password-1");
    expect(JSON.parse(body).password_fields_exposed).toBe(false);

    const detail = (await import("@/app/api/admin/users/[id]/route")).GET;
    const detailRes = await detail(json(`/api/admin/users/${target.toHexString()}`), {
      params: Promise.resolve({ id: target.toHexString() }),
    });
    const detailBody = await detailRes.text();
    expect(detailBody).not.toMatch(/passwordHash/);
    expect(detailBody).not.toContain("$2b$");

    // The force-reset endpoint NEVER returns the token: it is delivered over an
    // out-of-band channel only. Nor is any password ever returned.
    const actions = (await import("@/app/api/admin/users/[id]/actions/route")).POST;
    const forced = await actions(
      json(`/api/admin/users/${target.toHexString()}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: target.toHexString(), action: "force_password_reset" }),
      })
    );
    expect(forced.status).toBe(200);
    const forcedRaw = await forced.text();
    expect(forcedRaw).not.toMatch(/resetToken/i);
    expect(forcedRaw).not.toMatch(/token\s*[:=]/i);
    expect(forcedRaw).not.toContain("?token=");
    const forcedBody = JSON.parse(forcedRaw) as Record<string, unknown>;
    expect(forcedBody.success).toBe(true);
    expect(forcedBody.password).toBeUndefined();
    expect(forcedBody.passwordHash).toBeUndefined();
    expect(forcedBody.expiresAt).toBeTruthy();

    // Only the sha256 HASH of the token is persisted, and it is 64 hex chars.
    const stored = await col(db, "passwordResets").find({ userId: target } as never).toArray();
    expect(stored).toHaveLength(1);
    const hash = String((stored[0] as unknown as { tokenHash: string }).tokenHash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(forcedRaw).not.toContain(hash);
    const row = await col<UserDoc>(db, "users").findOne({ _id: target } as never);
    expect(row?.mustChangePassword).toBe(true);
  });

  it("rate-limits repeated privileged writes", async () => {
    const teacher = await makeUser("http_rl", "teacher");
    await signIn(teacher);
    const announcements = (await import("@/app/api/announcements/route")).POST;

    let limited = false;
    let created = 0;
    for (let i = 0; i < 120; i += 1) {
      const res = await announcements(
        json("/api/announcements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: `Rate limited notice ${i}`, body: "Notice body." }),
        })
      );
      if (res.status === 429) {
        limited = true;
        break;
      }
      if (res.status === 201) created += 1;
    }
    expect(limited).toBe(true);
    expect(created).toBeGreaterThan(0);
    expect(created).toBeLessThan(120);
  });

  it("rejects malformed bodies with 400, not 500", async () => {
    const teacher = await makeUser("http_malformed_body", "teacher");
    await signIn(teacher);
    const reelsPost = (await import("@/app/api/reels/route")).POST;
    for (const body of ["", "not json", "[]", '{"title":123}', '{"videoUrl":"javascript:alert(1)"}']) {
      const res = await reelsPost(
        json("/api/reels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      );
      expect(res.status, `body "${body}" must not 500`).toBe(400);
    }
  });

  it("never leaks internal moderation configuration to students", async () => {
    const student = await makeUser("http_mod_student", "student", "Grade 9");
    await signIn(student);
    const queue = (await import("@/app/api/moderation/queue/route")).GET;
    const res = await queue(json("/api/moderation/queue"));
    expect(res.status).toBe(403);
  });

  it("shows provider status without keys or prompts to moderators", async () => {
    const moderator = await makeUser("http_mod_status", "moderator");
    await signIn(moderator);
    const queue = (await import("@/app/api/moderation/queue/route")).GET;
    const res = await queue(json("/api/moderation/queue"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toMatch(/api[_-]?key/i);
    expect(body).not.toMatch(/prompt/i);
    expect(JSON.parse(body).provider.configured).toBe(false);
  });

  it("destroys a session on logout so the cookie cannot be reused", async () => {
    const db = await getDb();
    const user = await makeUser("http_logout", "student", "Grade 9");
    const token = await signIn(user);

    const analytics = (await import("@/app/api/admin/analytics/route")).GET;
    await signIn(user);
    expect((await analytics()).status).toBe(403);

    await destroySession(db, token);
    cookieStore.set(SESSION_COOKIE, token);
    expect((await analytics()).status).toBe(401);
  });

  it("keeps audit logs append-only with no secret material", async () => {
    const db = await getDb();
    const admin = await makeUser("http_audit_admin2", "admin");
    await logAudit(db, {
      actorId: admin.toHexString(),
      action: "exam.publish",
      targetType: "class_exam",
      targetId: oid("0123456789abcdef01234567").toHexString(),
      details: { questionCount: 3 },
    });
    const rows = await col(db, "auditLogs").find({} as never).toArray();
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain("Password-1");
    expect(JSON.stringify(rows)).not.toMatch(/\$2[aby]\$/);
  });
});