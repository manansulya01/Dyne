import { Db, ObjectId } from "mongodb";
import { col } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";

/**
 * Personalized student report aggregation.
 *
 * Every number here is computed from real Dyne collections. Where Dyne has no
 * data, the report says "no data" (null) rather than inventing a metric.
 *
 * Privacy rules enforced here:
 *   - a student may only ever read their own report;
 *   - a teacher may only read students in classes they actually teach
 *     (verified through their own published assignments/exams);
 *   - admins may read any student;
 *   - report data is never exposed via profiles, people search, or global
 *     search.
 */

export interface StudentReportScope {
  studentId: string;
  actor: { id: string; role: string };
}

export type ReportAccess =
  | { ok: true; scope: "self" | "taught" | "admin" }
  | { ok: false; status: 404 | 403; message: string };

/** Classes a teacher is authorized to teach (from their own academic content). */
async function taughtClasses(db: Db, teacherId: string | ObjectId): Promise<string[]> {
  const tid = toObjectId(teacherId);
  const [assignments, exams] = await Promise.all([
    col(db, "classAssignments")
      .distinct("classGrade", { createdBy: tid } as never)
      .catch(() => [] as unknown[]),
    col(db, "classExams")
      .distinct("classGrade", { createdBy: tid } as never)
      .catch(() => [] as unknown[]),
  ]);
  return [
    ...new Set(
      [...(assignments as unknown[]), ...(exams as unknown[])].filter(
        (g): g is string => typeof g === "string" && g.length > 0
      )
    ),
  ].sort();
}

/**
 * Decide whether `actor` may read the report for `studentId`.
 * Returns 404 for "no such student" and 403 for "exists but not yours" without
 * leaking details the caller is not entitled to.
 */
export async function authorizeReportAccess(
  db: Db,
  actor: { id: string; role: string },
  studentId: string | ObjectId
): Promise<ReportAccess> {
  // A malformed id is a not-found, never a thrown error: the repository is
  // reachable from several layers and must fail closed, not loudly.
  let sid: ObjectId;
  try {
    sid = toObjectId(studentId);
  } catch {
    return { ok: false, status: 404, message: "Student not found" };
  }
  const student = await col(db, "users")
    .find({ _id: sid, role: "student" } as never)
    .project({ classGrade: 1 })
    .next();
  if (!student) return { ok: false, status: 404, message: "Student not found" };

  if (String(actor.id) === sid.toHexString()) {
    return { ok: true, scope: "self" };
  }
  if (actor.role === "admin" || actor.role === "super_admin") {
    return { ok: true, scope: "admin" };
  }
  const grades = await taughtClasses(db, actor.id);
  const studentGrade = (student as unknown as { classGrade: string | null }).classGrade;
  if (studentGrade && grades.includes(studentGrade)) {
    return { ok: true, scope: "taught" };
  }
  return { ok: false, status: 403, message: "Forbidden" };
}

/** All students an actor may report on (self, taught classes, or all for admins). */
export async function reportableStudents(
  db: Db,
  actor: { id: string; role: string },
  opts: { limit?: number; offset?: number; search?: string; classGrade?: string } = {}
) {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);

  const filter: Record<string, unknown> = { role: "student" };
  if (actor.role !== "admin" && actor.role !== "super_admin") {
    const grades = await taughtClasses(db, actor.id);
    filter.classGrade = { $in: grades.length > 0 ? grades : [] };
  }
  if (opts.classGrade) filter.classGrade = opts.classGrade;
  if (opts.search?.trim()) {
    const rx = {
      $regex: opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
    filter.$or = [{ username: rx }, { displayName: rx }];
  }

  const [rows, total] = await Promise.all([
    col(db, "users")
      .find(filter as never)
      .project({ username: 1, displayName: 1, avatarUrl: 1, classGrade: 1, role: 1, createdAt: 1 })
      .sort({ classGrade: 1, displayName: 1, _id: 1 })
      .skip(offset)
      .limit(limit)
      .toArray(),
    col(db, "users").countDocuments(filter as never),
  ]);

  const grades = await col(db, "users")
    .distinct("classGrade", { role: "student", classGrade: { $type: "string", $ne: "" } } as never)
    .catch(() => [] as unknown[]);

  return {
    students: rows,
    total,
    hasMore: offset + rows.length < total,
    taughtClasses: actor.role === "admin" || actor.role === "super_admin"
      ? (grades as unknown[]).filter((g): g is string => typeof g === "string").sort()
      : await taughtClasses(db, actor.id),
  };
}

/** Optional stats block: null everywhere when Dyne holds no data. */
export interface ReportSection<T> {
  available: boolean;
  data: T | null;
}

export interface StudentReport {
  student: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
    class_grade: string | null;
    account_status: "active" | "suspended" | "banned";
    suspended_until: string | null;
    banned_at: string | null;
    joined_at: unknown;
  };
  scope: "self" | "taught" | "admin";
  generatedAt: string;
  academic: {
    classAssignments: ReportSection<{
      assigned: number;
      completed: number;
      inProgress: number;
      notStarted: number;
      overdue: number;
      completionRate: number | null;
      perAssignment: Array<{
        assignmentId: string;
        title: string;
        subject: string;
        dueDate: unknown;
        status: string;
        submittedAt: unknown;
        score: number | null;
        maxMarks: number | null;
        overdue: boolean;
      }>;
    }>;
    exams: ReportSection<{
      attempted: number;
      graded: number;
      awaitingGrading: number;
      averageScore: number | null;
      averagePercentage: number | null;
      highestScore: number | null;
      lowestScore: number | null;
      passed: number;
      failed: number;
      perExam: Array<{
        attemptId: string;
        examId: string;
        title: string;
        subject: string;
        mode: string;
        attemptNumber: number;
        status: string;
        score: number | null;
        maxScore: number;
        percentage: number | null;
        passed: boolean | null;
        resultsReleased: boolean;
      }>;
    }>;
    goals: ReportSection<{
      total: number;
      active: number;
      completed: number;
      items: Array<{ id: string; title: string; current: number; target: number; unit: string; status: string; deadline: unknown }>;
    }>;
    habits: ReportSection<{
      total: number;
      active: number;
      items: Array<{ id: string; name: string; frequency: string; todayCount: number; last7Days: Array<{ date: string; count: number }> }>;
    }>;
    studySessions: ReportSection<{
      total: number;
      completed: number;
      totalSeconds: number;
      last7DaysSeconds: Array<{ date: string; seconds: number }>;
      bySubject: Array<{ subject: string | null; seconds: number }>;
    }>;
    studyMaterials: ReportSection<{
      saved: number;
      recent: Array<{ id: string; title: string; subject: string; savedAt: unknown }>;
    }>;
  };
  usage: {
    posts: ReportSection<{ total: number; last30Days: number }>;
    comments: ReportSection<{ total: number; last30Days: number }>;
    communities: ReportSection<{ total: number; items: Array<{ id: string; name: string; slug: string; role: string }> }>;
    groupMessages: ReportSection<{ sent: number; conversations: number; last30Days: number }>;
    videosWatched: ReportSection<{ distinct: number; last30Days: number }>;
    reelsWatched: ReportSection<{ distinct: number; last30Days: number }>;
    reelsCreated: ReportSection<{ total: number; approved: number; pending: number }>;
    videosCreated: ReportSection<{ total: number; approved: number; pending: number }>;
    blogs: ReportSection<{ total: number; published: number }>;
    stories: ReportSection<{ total: number; active: number }>;
    events: ReportSection<{ rsvps: number; upcoming: number }>;
    follows: ReportSection<{ followers: number; following: number }>;
  };
  /** Observations derived only from the numbers above (clearly labelled). */
  observations: string[];
}

/** Build the full report for one student. Caller must authorize first. */
export async function buildStudentReport(
  db: Db,
  studentId: string | ObjectId,
  scope: "self" | "taught" | "admin"
): Promise<StudentReport | null> {
  const sid = toObjectId(studentId);
  const user = await col(db, "users")
    .find({ _id: sid, role: "student" } as never)
    .project({
      username: 1, displayName: 1, avatarUrl: 1, role: 1, classGrade: 1,
      suspendedUntil: 1, bannedAt: 1, createdAt: 1,
    })
    .next();
  if (!user) return null;
  const u = user as unknown as Record<string, unknown>;
  const classGrade = (u.classGrade ?? null) as string | null;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  /* ------------------------- Academic ------------------------- */

  // Assignments: only ones in the student's class (or assigned by their teachers).
  const assignmentDocs = await col(db, "classAssignments")
    .find({
      status: { $ne: "draft" },
      ...(classGrade ? { classGrade } : { classGrade: null }),
    } as never)
    .sort({ dueDate: -1, createdAt: -1 })
    .limit(200)
    .toArray();

  const submissions = assignmentDocs.length
    ? await col(db, "assignmentSubmissions")
        .find({ assignmentId: { $in: assignmentDocs.map((a) => a._id) }, studentId: sid } as never)
        .limit(500)
        .toArray()
    : [];
  const subByAssignment = new Map(submissions.map((s) => [s.assignmentId.toHexString(), s]));

  const perAssignment = assignmentDocs.map((a) => {
    const raw = a as unknown as Record<string, unknown>;
    const sub = subByAssignment.get(a._id.toHexString());
    const submitted = sub?.status === "submitted" || sub?.status === "completed";
    const due = (raw.dueDate ?? null) as Date | null;
    return {
      assignmentId: a._id.toHexString(),
      title: String(raw.title ?? ""),
      subject: String(raw.subject ?? ""),
      dueDate: raw.dueDate ?? null,
      status: sub?.status ?? "not_started",
      submittedAt: sub?.submittedAt ?? null,
      score: sub?.score ?? null,
      maxMarks: (raw.maxMarks ?? null) as number | null,
      overdue: !submitted && !!due && due.getTime() < now.getTime(),
    };
  });
  const completedAssignments = perAssignment.filter((a) => a.status === "submitted" || a.status === "completed");
  const inProgressAssignments = perAssignment.filter((a) => a.status === "in_progress");
  const notStartedAssignments = perAssignment.filter((a) => a.status === "not_started");
  const overdueAssignments = perAssignment.filter((a) => a.overdue);

  const academicAssignments: ReportSection<NonNullable<StudentReport["academic"]["classAssignments"]["data"]>> =
    assignmentDocs.length > 0
      ? {
          available: true,
          data: {
            assigned: perAssignment.length,
            completed: completedAssignments.length,
            inProgress: inProgressAssignments.length,
            notStarted: notStartedAssignments.length,
            overdue: overdueAssignments.length,
            completionRate: Math.round((completedAssignments.length / perAssignment.length) * 100),
            perAssignment,
          },
        }
      : { available: false, data: null };

  // Exams
  const publishedExams = await col(db, "classExams")
    .find({ status: { $ne: "draft" }, ...(classGrade ? { classGrade } : { classGrade: null }) } as never)
    .project({ title: 1, subject: 1, mode: 1, totalMarks: 1, resultsReleased: 1, _id: 1 })
    .limit(200)
    .toArray();

  const attempts = publishedExams.length
    ? await col(db, "examAttempts")
        .find({ examId: { $in: publishedExams.map((e) => e._id) }, studentId: sid } as never)
        .sort({ attemptNumber: -1 })
        .limit(200)
        .toArray()
    : [];
  const examById = new Map(publishedExams.map((e) => [e._id.toHexString(), e as unknown as Record<string, unknown>]));

  const perExam = attempts.map((a) => {
    const raw = a as unknown as Record<string, unknown>;
    const exam = examById.get(a.examId.toHexString()) ?? {};
    return {
      attemptId: a._id.toHexString(),
      examId: a.examId.toHexString(),
      title: String(exam.title ?? "Exam"),
      subject: String(exam.subject ?? ""),
      mode: String(exam.mode ?? "timed"),
      attemptNumber: Number(raw.attemptNumber ?? 1),
      status: String(raw.status ?? "submitted"),
      // Results are withheld until the exam owner releases them.
      score: exam.resultsReleased ? ((raw.score ?? null) as number | null) : null,
      maxScore: Number(raw.maxScore ?? 0),
      percentage: exam.resultsReleased ? ((raw.percentage ?? null) as number | null) : null,
      passed: exam.resultsReleased ? ((raw.passed ?? null) as boolean | null) : null,
      resultsReleased: Boolean(exam.resultsReleased),
    };
  });
  const releasedScores = perExam
    .filter((e) => e.resultsReleased && typeof e.score === "number")
    .map((e) => e.score as number);
  const releasedPercentages = perExam
    .filter((e) => e.resultsReleased && typeof e.percentage === "number")
    .map((e) => e.percentage as number);

  const academicExams: ReportSection<NonNullable<StudentReport["academic"]["exams"]["data"]>> =
    attempts.length > 0
      ? {
          available: true,
          data: {
            attempted: attempts.length,
            graded: attempts.filter((a) => a.status === "graded").length,
            awaitingGrading: attempts.filter((a) => a.status === "submitted").length,
            averageScore:
              releasedScores.length > 0
                ? Math.round((releasedScores.reduce((s, n) => s + n, 0) / releasedScores.length) * 100) / 100
                : null,
            averagePercentage:
              releasedPercentages.length > 0
                ? Math.round((releasedPercentages.reduce((s, n) => s + n, 0) / releasedPercentages.length) * 100) / 100
                : null,
            highestScore: releasedScores.length > 0 ? Math.max(...releasedScores) : null,
            lowestScore: releasedScores.length > 0 ? Math.min(...releasedScores) : null,
            passed: perExam.filter((e) => e.passed === true).length,
            failed: perExam.filter((e) => e.passed === false).length,
            perExam,
          },
        }
      : { available: false, data: null };

  // Goals
  const goalDocs = await col(db, "goals").find({ userId: sid } as never).sort({ createdAt: -1 }).limit(50).toArray();
  const goals: ReportSection<NonNullable<StudentReport["academic"]["goals"]["data"]>> =
    goalDocs.length > 0
      ? {
          available: true,
          data: {
            total: goalDocs.length,
            active: goalDocs.filter((g) => g.status === "active").length,
            completed: goalDocs.filter((g) => g.status === "completed").length,
            items: goalDocs.map((g) => ({
              id: g._id.toHexString(),
              title: g.title,
              current: g.current ?? 0,
              target: g.target,
              unit: g.unit,
              status: g.status,
              deadline: g.deadline ?? null,
            })),
          },
        }
      : { available: false, data: null };

  // Habits (real logs only)
  const habitDocs = await col(db, "habits").find({ userId: sid } as never).limit(50).toArray();
  const habitLogs = habitDocs.length
    ? await col(db, "habitLogs")
        .find({ habitId: { $in: habitDocs.map((h) => h._id) }, date: { $gte: weekAgo.toISOString().slice(0, 10) } } as never)
        .limit(1000)
        .toArray()
    : [];
  const todayKey = now.toISOString().slice(0, 10);
  const habits: ReportSection<NonNullable<StudentReport["academic"]["habits"]["data"]>> =
    habitDocs.length > 0
      ? {
          available: true,
          data: {
            total: habitDocs.length,
            active: habitDocs.filter((h) => h.isActive).length,
            items: habitDocs.map((h) => {
              const logs = habitLogs.filter((l) => l.habitId.equals(h._id));
              const byDate = new Map<string, number>();
              for (const l of logs) byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.count);
              const last7: Array<{ date: string; count: number }> = [];
              for (let i = 6; i >= 0; i -= 1) {
                const d = new Date(now.getTime() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
                last7.push({ date: d, count: byDate.get(d) ?? 0 });
              }
              return {
                id: h._id.toHexString(),
                name: h.name,
                frequency: h.frequency,
                todayCount: byDate.get(todayKey) ?? 0,
                last7Days: last7,
              };
            }),
          },
        }
      : { available: false, data: null };

  // Study sessions (real durations only)
  const sessionDocs = await col(db, "studySessions")
    .find({ userId: sid } as never)
    .sort({ startedAt: -1 })
    .limit(500)
    .toArray();
  const completedSessions = sessionDocs.filter((s) => s.status === "completed" && s.endedAt);
  const effectiveSeconds = (s: (typeof sessionDocs)[number]): number => {
    const started = new Date(s.startedAt).getTime();
    const ended = s.endedAt ? new Date(s.endedAt).getTime() : now.getTime();
    return Math.max(0, Math.floor((ended - started) / 1000) - (s.pausedSeconds ?? 0));
  };
  const studySessions: ReportSection<NonNullable<StudentReport["academic"]["studySessions"]["data"]>> =
    sessionDocs.length > 0
      ? {
          available: true,
          data: {
            total: sessionDocs.length,
            completed: completedSessions.length,
            totalSeconds: completedSessions.reduce((s, x) => s + effectiveSeconds(x), 0),
            last7DaysSeconds: (() => {
              const byDate = new Map<string, number>();
              for (const s of completedSessions) {
                const d = new Date(s.startedAt).toISOString().slice(0, 10);
                byDate.set(d, (byDate.get(d) ?? 0) + effectiveSeconds(s));
              }
              const out: Array<{ date: string; seconds: number }> = [];
              for (let i = 6; i >= 0; i -= 1) {
                const d = new Date(now.getTime() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
                out.push({ date: d, seconds: byDate.get(d) ?? 0 });
              }
              return out;
            })(),
            bySubject: (() => {
              const bySubject = new Map<string, number>();
              for (const s of completedSessions) {
                const key = s.subject ?? "Unspecified";
                bySubject.set(key, (bySubject.get(key) ?? 0) + effectiveSeconds(s));
              }
              return [...bySubject.entries()]
                .map(([subject, seconds]) => ({ subject, seconds }))
                .sort((a, b) => b.seconds - a.seconds)
                .slice(0, 10);
            })(),
          },
        }
      : { available: false, data: null };

  // Saved study materials
  const savedMaterials = await col(db, "savedStudyMaterials")
    .find({ userId: sid } as never)
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();
  const materialIds = savedMaterials.map((s) => s.materialId);
  const materialDocs = materialIds.length
    ? await col(db, "studyMaterials")
        .find({ _id: { $in: materialIds } } as never)
        .project({ title: 1, subject: 1 })
        .limit(20)
        .toArray()
    : [];
  const materialById = new Map(materialDocs.map((m) => [m._id.toHexString(), m as unknown as Record<string, unknown>]));
  const savedMaterialTotal = await col(db, "savedStudyMaterials").countDocuments({ userId: sid } as never);
  const studyMaterials: ReportSection<NonNullable<StudentReport["academic"]["studyMaterials"]["data"]>> =
    savedMaterialTotal > 0
      ? {
          available: true,
          data: {
            saved: savedMaterialTotal,
            recent: savedMaterials.map((s) => {
              const m = materialById.get(s.materialId.toHexString()) ?? {};
              return {
                id: s.materialId.toHexString(),
                title: String(m.title ?? "Study material"),
                subject: String(m.subject ?? ""),
                savedAt: s.createdAt,
              };
            }),
          },
        }
      : { available: false, data: null };

  /* --------------------------- Usage --------------------------- */

  const [postTotal, postRecent, commentTotal, commentRecent] = await Promise.all([
    col(db, "posts").countDocuments({ authorId: sid, deletedAt: null } as never),
    col(db, "posts").countDocuments({ authorId: sid, createdAt: { $gte: thirtyDaysAgo } } as never),
    col(db, "comments").countDocuments({ authorId: sid, deletedAt: null } as never),
    col(db, "comments").countDocuments({ authorId: sid, createdAt: { $gte: thirtyDaysAgo } } as never),
  ]);

  const memberships = await col(db, "communityMembers").find({ userId: sid } as never).limit(200).toArray();
  const communityDocs = memberships.length
    ? await col(db, "communities")
        .find({ _id: { $in: memberships.map((m) => m.communityId) } } as never)
        .project({ name: 1, slug: 1 })
        .limit(200)
        .toArray()
    : [];
  const communityById = new Map(communityDocs.map((c) => [c._id.toHexString(), c as unknown as Record<string, unknown>]));

  const conversationIds = await col(db, "chatMembers")
    .find({ userId: sid } as never)
    .project({ conversationId: 1 })
    .limit(500)
    .toArray();
  const convoIdList = conversationIds.map((m) => m.conversationId);
  const [messageTotal, messageRecent] = convoIdList.length > 0
    ? await Promise.all([
        col(db, "chatMessages").countDocuments({ senderId: sid, conversationId: { $in: convoIdList }, deletedAt: null } as never),
        col(db, "chatMessages").countDocuments({ senderId: sid, conversationId: { $in: convoIdList }, createdAt: { $gte: thirtyDaysAgo } } as never),
      ])
    : [0, 0];

  const [videoViews, recentVideoViews, reelViews, recentReelViews] = await Promise.all([
    col(db, "videoViews").distinct("videoId", { userId: sid } as never).catch(() => [] as unknown[]),
    col(db, "videoViews").countDocuments({ userId: sid, createdAt: { $gte: thirtyDaysAgo } } as never),
    col(db, "reelViews").distinct("reelId", { userId: sid } as never).catch(() => [] as unknown[]),
    col(db, "reelViews").countDocuments({ userId: sid, createdAt: { $gte: thirtyDaysAgo } } as never),
  ]);

  const reelDocs = await col(db, "reels").find({ creatorId: sid } as never).project({ moderationStatus: 1 }).limit(500).toArray();
  const videoDocs = await col(db, "videos").find({ creatorId: sid } as never).project({ moderationStatus: 1 }).limit(500).toArray();
  const blogDocs = await col(db, "blogs").find({ authorId: sid } as never).project({ isPublished: 1 }).limit(500).toArray();
  const storyDocs = await col(db, "stories").find({ authorId: sid } as never).project({ expiresAt: 1 }).limit(500).toArray();

  const [rsvpTotal, upcomingRsvps, followers, following] = await Promise.all([
    col(db, "eventAttendees").countDocuments({ userId: sid } as never),
    col(db, "eventAttendees").countDocuments({ userId: sid, status: "going" } as never),
    col(db, "follows").countDocuments({ followingId: sid } as never),
    col(db, "follows").countDocuments({ followerId: sid } as never),
  ]);

  const usage: StudentReport["usage"] = {
    posts: postTotal > 0 || postRecent > 0 ? { available: true, data: { total: postTotal, last30Days: postRecent } } : { available: false, data: null },
    comments: commentTotal > 0 || commentRecent > 0 ? { available: true, data: { total: commentTotal, last30Days: commentRecent } } : { available: false, data: null },
    communities:
      memberships.length > 0
        ? {
            available: true,
            data: {
              total: memberships.length,
              items: memberships.slice(0, 20).map((m) => {
                const c = communityById.get(m.communityId.toHexString()) ?? {};
                return {
                  id: m.communityId.toHexString(),
                  name: String(c.name ?? "Community"),
                  slug: String(c.slug ?? ""),
                  role: m.role,
                };
              }),
            },
          }
        : { available: false, data: null },
    groupMessages:
      messageTotal > 0
        ? {
            available: true,
            data: {
              sent: messageTotal,
              conversations: convoIdList.length,
              last30Days: messageRecent,
            },
          }
        : { available: false, data: null },
    videosWatched:
      (videoViews as unknown[]).length > 0 || recentVideoViews > 0
        ? { available: true, data: { distinct: (videoViews as unknown[]).length, last30Days: recentVideoViews } }
        : { available: false, data: null },
    reelsWatched:
      (reelViews as unknown[]).length > 0 || recentReelViews > 0
        ? { available: true, data: { distinct: (reelViews as unknown[]).length, last30Days: recentReelViews } }
        : { available: false, data: null },
    reelsCreated:
      reelDocs.length > 0
        ? {
            available: true,
            data: {
              total: reelDocs.length,
              approved: reelDocs.filter((r) => r.moderationStatus === "approved").length,
              pending: reelDocs.filter((r) => r.moderationStatus === "pending" || r.moderationStatus === "flagged").length,
            },
          }
        : { available: false, data: null },
    videosCreated:
      videoDocs.length > 0
        ? {
            available: true,
            data: {
              total: videoDocs.length,
              approved: videoDocs.filter((v) => !v.moderationStatus || v.moderationStatus === "approved").length,
              pending: videoDocs.filter((v) => v.moderationStatus === "pending" || v.moderationStatus === "flagged").length,
            },
          }
        : { available: false, data: null },
    blogs:
      blogDocs.length > 0
        ? {
            available: true,
            data: { total: blogDocs.length, published: blogDocs.filter((b) => b.isPublished).length },
          }
        : { available: false, data: null },
    stories:
      storyDocs.length > 0
        ? {
            available: true,
            data: {
              total: storyDocs.length,
              active: storyDocs.filter((s) => s.expiresAt.getTime() > now.getTime()).length,
            },
          }
        : { available: false, data: null },
    events:
      rsvpTotal > 0 || upcomingRsvps > 0
        ? { available: true, data: { rsvps: rsvpTotal, upcoming: upcomingRsvps } }
        : { available: false, data: null },
    follows:
      followers > 0 || following > 0
        ? { available: true, data: { followers, following } }
        : { available: false, data: null },
  };

  /* ---------------------- Observations ---------------------- */
  // Only statements that are strictly true of the numbers above. No AI
  // narrative, no speculation.
  const observations: string[] = [];
  if (academicAssignments.data) {
    const a = academicAssignments.data;
    if (a.overdue > 0) {
      observations.push(`${a.overdue} assignment${a.overdue === 1 ? " is" : "s are"} past the due date without a submission.`);
    }
    if (a.assigned > 0 && a.completed === 0) {
      observations.push("No published assignment has been submitted yet.");
    } else if (a.assigned > 0) {
      observations.push(`${a.completed} of ${a.assigned} published assignments completed (${a.completionRate}%).`);
    }
  }
  if (academicExams.data) {
    const e = academicExams.data;
    if (e.attempted > 0) {
      observations.push(
        `${e.attempted} exam attempt${e.attempted === 1 ? "" : "s"} recorded; ${e.awaitingGrading} awaiting teacher grading.`
      );
      if (e.averagePercentage !== null) {
        observations.push(`Released results average ${e.averagePercentage}% (${e.passed} passed, ${e.failed} failed).`);
      } else {
        observations.push("No exam results have been released yet.");
      }
    }
  }
  if (studySessions.data && studySessions.data.total > 0) {
    const hours = Math.round((studySessions.data.totalSeconds / 3600) * 10) / 10;
    observations.push(`${hours}h of completed study time across ${studySessions.data.completed} session${studySessions.data.completed === 1 ? "" : "s"}.`);
  }
  if (habits.data && habits.data.active > 0) {
    observations.push(`${habits.data.active} active habit${habits.data.active === 1 ? "" : "s"} tracked.`);
  }
  if (goals.data && goals.data.active > 0) {
    observations.push(`${goals.data.active} active goal${goals.data.active === 1 ? "" : "s"}.`);
  }
  if (usage.videosWatched.data || usage.reelsWatched.data) {
    const v = usage.videosWatched.data?.distinct ?? 0;
    const r = usage.reelsWatched.data?.distinct ?? 0;
    observations.push(`Watched ${v} video${v === 1 ? "" : "s"} and ${r} reel${r === 1 ? "" : "s"}.`);
  }
  if (observations.length === 0) {
    observations.push("No academic or activity data has been recorded for this student yet.");
  }

  const bannedAt = (u.bannedAt ?? null) as Date | null;
  const suspendedUntil = (u.suspendedUntil ?? null) as Date | null;

  return {
    student: {
      id: sid.toHexString(),
      username: String(u.username ?? ""),
      display_name: (u.displayName ?? null) as string | null,
      avatar_url: (u.avatarUrl ?? null) as string | null,
      role: "student",
      class_grade: classGrade,
      account_status: bannedAt
        ? "banned"
        : suspendedUntil && suspendedUntil.getTime() > now.getTime()
          ? "suspended"
          : "active",
      suspended_until: suspendedUntil ? suspendedUntil.toISOString() : null,
      banned_at: bannedAt ? bannedAt.toISOString() : null,
      joined_at: u.createdAt,
    },
    scope,
    generatedAt: now.toISOString(),
    academic: {
      classAssignments: academicAssignments,
      exams: academicExams,
      goals,
      habits,
      studySessions,
      studyMaterials,
    },
    usage,
    observations,
  };
}
