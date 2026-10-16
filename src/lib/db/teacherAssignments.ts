import { Db, ObjectId } from "mongodb";
import {
  col,
  type TeacherAssignmentDoc,
  type AssignmentSubmissionDoc,
} from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serialize, serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";
import { isSafeMediaUrl } from "./videos";

/**
 * Teacher-authored class assignments.
 *
 * Distinct from the student-owned `assignments` collection (a personal
 * tracker). Completion is NEVER inferred: it is computed from real
 * `assignmentSubmissions` rows and the actual student roster of the
 * assignment's class.
 */

export interface TeacherAssignmentInput {
  title: string;
  description?: string | null;
  subject: string;
  classGrade: string;
  instructions?: string | null;
  dueDate?: Date | null;
  publishAt?: Date | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  maxMarks?: number | null;
  status?: "draft" | "published" | "closed";
}

export async function createTeacherAssignment(
  db: Db,
  createdBy: string | ObjectId,
  input: TeacherAssignmentInput
) {
  if (input.title.trim().length < 3 || input.title.length > 200) {
    return { ok: false as const, reason: "bad_title" as const };
  }
  if (!input.subject.trim()) return { ok: false as const, reason: "bad_subject" as const };
  if (!input.classGrade.trim()) return { ok: false as const, reason: "bad_class" as const };
  if (input.attachmentUrl && !isSafeMediaUrl(input.attachmentUrl)) {
    return { ok: false as const, reason: "bad_attachment" as const };
  }
  if (input.maxMarks != null && (!Number.isFinite(input.maxMarks) || input.maxMarks <= 0)) {
    return { ok: false as const, reason: "bad_marks" as const };
  }
  const now = new Date();
  const res = await col<TeacherAssignmentDoc>(db, "classAssignments").insertOne({
    title: input.title.trim(),
    description: input.description?.trim().slice(0, 5000) || null,
    subject: input.subject.trim().slice(0, 100),
    classGrade: input.classGrade.trim().slice(0, 50),
    courseId: null,
    instructions: input.instructions?.trim().slice(0, 5000) || null,
    status: input.status ?? "draft",
    dueDate: input.dueDate ?? null,
    publishAt: input.publishAt ?? null,
    attachmentUrl: input.attachmentUrl ?? null,
    attachmentName: input.attachmentName?.slice(0, 200) ?? null,
    maxMarks: input.maxMarks ?? null,
    // Roster size is derived when published, never guessed here.
    assignedCount: 0,
    completedCount: 0,
    createdBy: toObjectId(createdBy),
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, assignmentId: res.insertedId };
}

export async function listTeacherAssignments(
  db: Db,
  opts: {
    createdBy?: string | ObjectId;
    classGrade?: string;
    status?: "draft" | "published" | "closed";
    limit?: number;
    before?: { createdAt: Date; id: string } | null;
  } = {}
) {
  const filter: Record<string, unknown> = {};
  if (opts.createdBy) filter.createdBy = toObjectId(opts.createdBy);
  if (opts.classGrade) filter.classGrade = opts.classGrade;
  if (opts.status) filter.status = opts.status;
  if (opts.before) {
    filter.$or = opts.before.id
      ? [
          { createdAt: { $lt: opts.before.createdAt } },
          { createdAt: opts.before.createdAt, _id: { $lt: toObjectId(opts.before.id) } },
        ]
      : [{ createdAt: { $lt: opts.before.createdAt } }];
  }
  const rows = await col<TeacherAssignmentDoc>(db, "classAssignments")
    .find(filter as never)
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit(opts.limit, 40, 20))
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.createdBy));
  return serializeMany(
    rows.map((r) => ({ ...r, creator: authors.get(r.createdBy.toHexString()) ?? null }))
  );
}

export async function getTeacherAssignment(db: Db, id: string | ObjectId) {
  const row = await col<TeacherAssignmentDoc>(db, "classAssignments").findOne({
    _id: toObjectId(id),
  } as never);
  if (!row) return null;
  const authors = await resolveAuthors(db, [row.createdBy]);
  return serialize({ ...row, creator: authors.get(row.createdBy.toHexString()) ?? null });
}

/** An assignment is editable only by its owner teacher or an admin. */
export function canManageAssignment(
  assignment: { createdBy: unknown },
  actor: { id: string; role: string }
): boolean {
  if (actor.role === "admin" || actor.role === "super_admin") return true;
  const owner = assignment.createdBy;
  const ownerId =
    typeof owner === "string" ? owner : (owner as { toHexString(): string }).toHexString();
  return ownerId === actor.id;
}

export async function updateTeacherAssignment(
  db: Db,
  id: string | ObjectId,
  patch: Partial<TeacherAssignmentInput>
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    if (patch.title.trim().length < 3 || patch.title.length > 200) {
      return { ok: false as const, reason: "bad_title" as const };
    }
    set.title = patch.title.trim();
  }
  if (patch.description !== undefined) set.description = patch.description?.trim().slice(0, 5000) || null;
  if (patch.subject !== undefined) set.subject = patch.subject.trim().slice(0, 100);
  if (patch.classGrade !== undefined) set.classGrade = patch.classGrade.trim().slice(0, 50);
  if (patch.instructions !== undefined) set.instructions = patch.instructions?.trim().slice(0, 5000) || null;
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate;
  if (patch.publishAt !== undefined) set.publishAt = patch.publishAt;
  if (patch.attachmentUrl !== undefined) {
    if (patch.attachmentUrl && !isSafeMediaUrl(patch.attachmentUrl)) {
      return { ok: false as const, reason: "bad_attachment" as const };
    }
    set.attachmentUrl = patch.attachmentUrl;
  }
  if (patch.attachmentName !== undefined) set.attachmentName = patch.attachmentName?.slice(0, 200) ?? null;
  if (patch.maxMarks !== undefined) set.maxMarks = patch.maxMarks;
  if (patch.status !== undefined) set.status = patch.status;

  const res = await col<TeacherAssignmentDoc>(db, "classAssignments").updateOne(
    { _id: toObjectId(id) } as never,
    { $set: set }
  );
  return res.matchedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

export async function deleteTeacherAssignment(db: Db, id: string | ObjectId) {
  const aid = toObjectId(id);
  const res = await col<TeacherAssignmentDoc>(db, "classAssignments").deleteOne({ _id: aid } as never);
  if (res.deletedCount === 0) return { ok: false as const, reason: "not_found" as const };
  await col<AssignmentSubmissionDoc>(db, "assignmentSubmissions").deleteMany({
    assignmentId: aid,
  } as never);
  await col(db, "notifications").deleteMany({ "data.assignment_id": aid.toHexString() } as never);
  return { ok: true as const };
}

/* --------------------------- Submissions --------------------------- */

export interface SubmitAssignmentInput {
  assignmentId: string | ObjectId;
  studentId: string | ObjectId;
  status?: "not_started" | "in_progress" | "submitted" | "completed";
  progress?: number;
  submissionUrl?: string | null;
  submissionName?: string | null;
  submissionText?: string | null;
}

/**
 * Create or update a student's submission.
 *
 * Uses an upsert keyed on (assignmentId, studentId) so rapid retries and
 * double taps converge on one row instead of duplicating submissions.
 */
export async function submitAssignment(
  db: Db,
  input: SubmitAssignmentInput
): Promise<{ ok: true; submission: AssignmentSubmissionDoc } | { ok: false; reason: "not_found" | "bad_url" | "closed" }> {
  const aid = toObjectId(input.assignmentId);
  const assignment = await col<TeacherAssignmentDoc>(db, "classAssignments").findOne({
    _id: aid,
  } as never);
  if (!assignment) return { ok: false, reason: "not_found" };
  if (assignment.status === "closed") return { ok: false, reason: "closed" };
  if (assignment.status === "draft") return { ok: false, reason: "not_found" };
  if (input.submissionUrl && !isSafeMediaUrl(input.submissionUrl)) {
    return { ok: false, reason: "bad_url" };
  }

  const status = input.status ?? "submitted";
  const now = new Date();
  const progress =
    status === "completed" || status === "submitted"
      ? 100
      : Math.min(Math.max(Math.round(input.progress ?? 0), 0), 100);

  const doc = await col<AssignmentSubmissionDoc>(db, "assignmentSubmissions").findOneAndUpdate(
    { assignmentId: aid, studentId: toObjectId(input.studentId) } as never,
    {
      $set: {
        status,
        progress,
        submittedAt: status === "submitted" || status === "completed" ? now : null,
        ...(input.submissionUrl !== undefined ? { submissionUrl: input.submissionUrl } : {}),
        ...(input.submissionName !== undefined && input.submissionName !== null
          ? { submissionName: input.submissionName.slice(0, 200) }
          : {}),
        ...(input.submissionText !== undefined && input.submissionText !== null
          ? { submissionText: input.submissionText.slice(0, 20000) }
          : {}),
        updatedAt: now,
      },
      $setOnInsert: {
        assignmentId: aid,
        studentId: toObjectId(input.studentId),
        score: null,
        feedback: null,
        gradedBy: null,
        gradedAt: null,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  await refreshAssignmentCounts(db, aid);
  return { ok: true, submission: doc as AssignmentSubmissionDoc };
}

export async function getSubmission(
  db: Db,
  assignmentId: string | ObjectId,
  studentId: string | ObjectId
) {
  return col<AssignmentSubmissionDoc>(db, "assignmentSubmissions").findOne({
    assignmentId: toObjectId(assignmentId),
    studentId: toObjectId(studentId),
  } as never);
}

export async function gradeSubmission(
  db: Db,
  assignmentId: string | ObjectId,
  studentId: string | ObjectId,
  graderId: string | ObjectId,
  input: { score?: number | null; feedback?: string | null }
) {
  const assignment = await col<TeacherAssignmentDoc>(db, "classAssignments").findOne({
    _id: toObjectId(assignmentId),
  } as never);
  if (!assignment) return { ok: false as const, reason: "not_found" as const };
  if (assignment.maxMarks != null && input.score != null && input.score > assignment.maxMarks) {
    return { ok: false as const, reason: "score_too_high" as const };
  }
  const res = await col<AssignmentSubmissionDoc>(db, "assignmentSubmissions").updateOne(
    { assignmentId: toObjectId(assignmentId), studentId: toObjectId(studentId) } as never,
    {
      $set: {
        score: input.score ?? null,
        feedback: input.feedback?.slice(0, 5000) ?? null,
        gradedBy: toObjectId(graderId),
        gradedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );
  return res.matchedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

/* --------------------------- Monitoring --------------------------- */

export type CompletionStatus = "completed" | "in_progress" | "not_started" | "overdue";

export interface StudentCompletionRow {
  studentId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  classGrade: string | null;
  status: CompletionStatus;
  submissionStatus: string | null;
  progress: number;
  submittedAt: Date | null;
  score: number | null;
  overdue: boolean;
}

export interface AssignmentMonitor {
  assignment: Record<string, unknown>;
  totals: { assigned: number; completed: number; inProgress: number; notStarted: number; overdue: number; completionRate: number | null };
  rows: StudentCompletionRow[];
  hasMore: boolean;
}

/** Actual student roster for a class grade (never a fabricated list). */
export async function classRoster(db: Db, classGrade: string) {
  return col(db, "users")
    .find({ role: "student", classGrade } as never)
    .project({ username: 1, displayName: 1, avatarUrl: 1, classGrade: 1 })
    .sort({ displayName: 1, username: 1 })
    .limit(1000)
    .toArray();
}

/**
 * Completion monitoring for one assignment.
 *
 * Every row is derived: the roster comes from real student accounts in the
 * class, status from real submission rows. A student with no submission row is
 * reported as "not started" — which is the honest answer, not a zero.
 */
export async function assignmentMonitor(
  db: Db,
  assignmentId: string | ObjectId,
  opts: { limit?: number; offset?: number; filter?: "all" | "completed" | "not_completed" | "overdue" } = {}
): Promise<AssignmentMonitor | null> {
  const aid = toObjectId(assignmentId);
  const assignment = await col<TeacherAssignmentDoc>(db, "classAssignments").findOne({ _id: aid } as never);
  if (!assignment) return null;

  const roster = await classRoster(db, assignment.classGrade);
  const submissions = await col<AssignmentSubmissionDoc>(db, "assignmentSubmissions")
    .find({ assignmentId: aid } as never)
    .limit(2000)
    .toArray();
  const byStudent = new Map<string, AssignmentSubmissionDoc>();
  for (const s of submissions) byStudent.set(s.studentId.toHexString(), s);

  const now = Date.now();
  const duePassed = assignment.dueDate ? assignment.dueDate.getTime() < now : false;

  const rows: StudentCompletionRow[] = roster.map((r) => {
    const raw = r as unknown as Record<string, unknown>;
    const idOf = (v: unknown): string => {
      if (typeof v === "string") return v;
      if (v && typeof v === "object" && "toHexString" in v) {
        return (v as { toHexString(): string }).toHexString();
      }
      return String(v ?? "");
    };
    const id = idOf(raw._id);
    const sub = byStudent.get(id);
    const submitted = sub?.status === "submitted" || sub?.status === "completed";
    const started = !!sub && !submitted;
    const overdue = !submitted && duePassed;
    const status: CompletionStatus = submitted
      ? "completed"
      : started
        ? "in_progress"
        : duePassed
          ? "not_started"
          : "not_started";
    return {
      studentId: id,
      username: String(raw.username ?? ""),
      displayName: (raw.displayName ?? null) as string | null,
      avatarUrl: (raw.avatarUrl ?? null) as string | null,
      classGrade: (raw.classGrade ?? null) as string | null,
      status,
      submissionStatus: sub?.status ?? null,
      progress: sub?.progress ?? 0,
      submittedAt: sub?.submittedAt ?? null,
      score: sub?.score ?? null,
      overdue,
    };
  });

  // Students outside the class roster who still submitted are included, so a
  // roster change never hides real work.
  for (const [studentId, sub] of byStudent) {
    if (rows.some((r) => r.studentId === studentId)) continue;
    const user = await col(db, "users")
      .find({ _id: sub.studentId } as never)
      .project({ username: 1, displayName: 1, avatarUrl: 1, classGrade: 1 })
      .next();
    const raw = user as unknown as Record<string, unknown> | null;
    const submitted = sub.status === "submitted" || sub.status === "completed";
    rows.push({
      studentId,
      username: String(raw?.username ?? "unknown"),
      displayName: (raw?.displayName ?? null) as string | null,
      avatarUrl: (raw?.avatarUrl ?? null) as string | null,
      classGrade: (raw?.classGrade ?? assignment.classGrade) as string | null,
      status: submitted ? "completed" : "in_progress",
      submissionStatus: sub.status,
      progress: sub.progress ?? 0,
      submittedAt: sub.submittedAt ?? null,
      score: sub.score ?? null,
      overdue: !submitted && duePassed,
    });
  }

  const filtered =
    opts.filter === "completed"
      ? rows.filter((r) => r.status === "completed")
      : opts.filter === "not_completed"
        ? rows.filter((r) => r.status !== "completed")
        : opts.filter === "overdue"
          ? rows.filter((r) => r.overdue)
          : rows;

  const completed = rows.filter((r) => r.status === "completed").length;
  const inProgress = rows.filter((r) => r.status === "in_progress").length;
  const notStarted = rows.filter((r) => r.status === "not_started").length;
  const overdue = rows.filter((r) => r.overdue).length;

  const offset = Math.max(0, opts.offset ?? 0);
  const limit = safeLimit(opts.limit, 50, 25);
  const paged = filtered.slice(offset, offset + limit);

  // Keep the denormalized counters on the assignment truthful.
  await col<TeacherAssignmentDoc>(db, "classAssignments").updateOne(
    { _id: aid } as never,
    { $set: { assignedCount: rows.length, completedCount: completed } }
  );

  return {
    assignment: serialize(assignment) as unknown as Record<string, unknown>,
    totals: {
      assigned: rows.length,
      completed,
      inProgress,
      notStarted,
      overdue,
      // Null (not 0) when there is no roster, so the UI can say "No data".
      completionRate: rows.length > 0 ? Math.round((completed / rows.length) * 100) : null,
    },
    rows: paged,
    hasMore: offset + paged.length < filtered.length,
  };
}

/** Recompute assignedCount/completedCount from real submissions. */
export async function refreshAssignmentCounts(db: Db, assignmentId: string | ObjectId) {
  const aid = toObjectId(assignmentId);
  const assignment = await col<TeacherAssignmentDoc>(db, "classAssignments").findOne({ _id: aid } as never);
  if (!assignment) return;
  const submissions = await col<AssignmentSubmissionDoc>(db, "assignmentSubmissions")
    .find({ assignmentId: aid } as never)
    .project({ status: 1 })
    .limit(5000)
    .toArray();
  const completed = submissions.filter(
    (s) => s.status === "submitted" || s.status === "completed"
  ).length;
  await col<TeacherAssignmentDoc>(db, "classAssignments").updateOne(
    { _id: aid } as never,
    { $set: { completedCount: completed, updatedAt: new Date() } }
  );
}

/**
 * The set of class grades a teacher/admin may monitor.
 * Admins: all grades present in the system. Teachers: their own classes only.
 */
export async function assignableClassGrades(
  db: Db,
  actor: { id: string; role: string }
): Promise<string[]> {
  if (actor.role === "admin" || actor.role === "super_admin") {
    const grades = await col(db, "users")
      .distinct("classGrade", { classGrade: { $type: "string", $ne: "" } } as never)
      .catch(() => [] as unknown[]);
    return (grades as unknown[]).filter((g): g is string => typeof g === "string").sort();
  }
  const own = await col<TeacherAssignmentDoc>(db, "classAssignments")
    .distinct("classGrade", { createdBy: toObjectId(actor.id) } as never)
    .catch(() => [] as unknown[]);
  return (own as unknown[]).filter((g): g is string => typeof g === "string").sort();
}

/** Can this actor view reports/monitoring for students in this class? */
export async function canAccessClass(
  db: Db,
  actor: { id: string; role: string },
  classGrade: string | null | undefined
): Promise<boolean> {
  if (actor.role === "admin" || actor.role === "super_admin") return true;
  if (!classGrade) return false;
  const grades = await assignableClassGrades(db, actor);
  return grades.includes(classGrade);
}

/** Students a teacher/admin may view (authorized classes only). */
export async function studentsInScope(
  db: Db,
  actor: { id: string; role: string },
  opts: { limit?: number; search?: string; offset?: number } = {}
) {
  const grades = await assignableClassGrades(db, actor);
  const filter: Record<string, unknown> = { role: "student" };
  if (grades.length > 0) filter.classGrade = { $in: grades };
  else filter.classGrade = { $in: [] }; // no authorized classes ⇒ no students
  if (opts.search?.trim()) {
    const rx = {
      $regex: opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
    filter.$or = [{ username: rx }, { displayName: rx }];
  }
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = safeLimit(opts.limit, 50, 25);
  const rows = await col(db, "users")
    .find(filter as never)
    .project({ username: 1, displayName: 1, avatarUrl: 1, classGrade: 1, role: 1, createdAt: 1 })
    .sort({ classGrade: 1, displayName: 1, _id: 1 })
    .skip(offset)
    .limit(limit)
    .toArray();
  const total = await col(db, "users").countDocuments(filter as never);
  return { students: rows, total, grades, hasMore: offset + rows.length < total };
}
