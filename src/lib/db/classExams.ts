import { Db, ObjectId } from "mongodb";
import {
  col,
  type ClassExamDoc,
  type ClassExamStatus,
  type ExamAnswer,
  type ExamAttemptDoc,
  type ExamMode,
  type ExamQuestion,
  type ExamQuestionType,
} from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serialize, serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";
import { logAudit } from "@/lib/security/audit";
import { createNotification } from "./notifications";

/**
 * Teacher exam builder, attempts and grading.
 *
 * One flexible question schema covers MCQ through essays and case-based
 * questions. Auto-grading is applied only to deterministic question types;
 * everything else waits for a human grader. No score is ever invented.
 */

export interface CreateExamInput {
  title: string;
  description?: string | null;
  subject: string;
  classGrade: string;
  mode?: ExamMode;
  status?: ClassExamStatus;
  instructions?: string | null;
  durationMinutes?: number | null;
  startsAt: Date;
  endsAt?: Date | null;
  totalMarks: number;
  passingMarks: number;
  attemptLimit?: number;
}

/** Question types the platform grades deterministically. */
const AUTO_GRADABLE: ReadonlySet<ExamQuestionType> = new Set([
  "mcq",
  "multiple_select",
  "true_false",
  "fill_blank",
  "matching",
  "numerical",
]);

export function isAutoGradable(type: ExamQuestionType): boolean {
  return AUTO_GRADABLE.has(type);
}

export async function createExam(
  db: Db,
  createdBy: string | ObjectId,
  input: CreateExamInput
) {
  if (input.passingMarks > input.totalMarks) {
    return { ok: false as const, reason: "bad_marks" as const };
  }
  if (input.endsAt && input.endsAt.getTime() < input.startsAt.getTime()) {
    return { ok: false as const, reason: "bad_window" as const };
  }
  const now = new Date();
  const res = await col<ClassExamDoc>(db, "classExams").insertOne({
    title: input.title.trim().slice(0, 200),
    description: input.description?.trim().slice(0, 5000) || null,
    subject: input.subject.trim().slice(0, 100),
    classGrade: input.classGrade.trim().slice(0, 50),
    courseId: null,
    mode: input.mode ?? "timed",
    status: input.status ?? "draft",
    instructions: input.instructions?.trim().slice(0, 5000) || null,
    durationMinutes: input.durationMinutes ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    totalMarks: input.totalMarks,
    passingMarks: input.passingMarks,
    attemptLimit: input.attemptLimit ?? 1,
    questions: [],
    createdBy: toObjectId(createdBy),
    resultsReleased: false,
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, examId: res.insertedId };
}

export async function listExams(
  db: Db,
  opts: {
    createdBy?: string | ObjectId;
    classGrade?: string;
    status?: ClassExamStatus;
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
  const rows = await col<ClassExamDoc>(db, "classExams")
    .find(filter as never)
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit(opts.limit, 40, 20))
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.createdBy));
  return serializeMany(
    rows.map((r) => ({
      ...r,
      questionCount: (r.questions ?? []).length,
      creator: authors.get(r.createdBy.toHexString()) ?? null,
    }))
  );
}

export async function getExam(db: Db, id: string | ObjectId) {
  const row = await col<ClassExamDoc>(db, "classExams").findOne({ _id: toObjectId(id) } as never);
  if (!row) return null;
  const authors = await resolveAuthors(db, [row.createdBy]);
  return serialize({ ...row, creator: authors.get(row.createdBy.toHexString()) ?? null });
}

/** Owner-or-admin check for full management (edit questions, publish, grade). */
export function canManageExam(
  exam: { createdBy: unknown },
  actor: { id: string; role: string }
): boolean {
  if (actor.role === "admin" || actor.role === "super_admin") return true;
  const owner = exam.createdBy;
  const ownerId =
    typeof owner === "string" ? owner : (owner as { toHexString(): string }).toHexString();
  return ownerId === actor.id;
}

export async function updateExam(
  db: Db,
  id: string | ObjectId,
  patch: Partial<CreateExamInput> & { resultsReleased?: boolean }
) {
  const existing = await col<ClassExamDoc>(db, "classExams").findOne({ _id: toObjectId(id) } as never);
  if (!existing) return { ok: false as const, reason: "not_found" as const };

  const totalMarks = patch.totalMarks ?? existing.totalMarks;
  const passingMarks = patch.passingMarks ?? existing.passingMarks;
  if (passingMarks > totalMarks) return { ok: false as const, reason: "bad_marks" as const };
  if (patch.endsAt !== undefined && patch.endsAt && patch.endsAt.getTime() < (patch.startsAt ?? existing.startsAt).getTime()) {
    return { ok: false as const, reason: "bad_window" as const };
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 200);
  if (patch.description !== undefined) set.description = patch.description?.trim().slice(0, 5000) || null;
  if (patch.subject !== undefined) set.subject = patch.subject.trim().slice(0, 100);
  if (patch.classGrade !== undefined) set.classGrade = patch.classGrade.trim().slice(0, 50);
  if (patch.mode !== undefined) set.mode = patch.mode;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.instructions !== undefined) set.instructions = patch.instructions?.trim().slice(0, 5000) || null;
  if (patch.durationMinutes !== undefined) set.durationMinutes = patch.durationMinutes;
  if (patch.startsAt !== undefined) set.startsAt = patch.startsAt;
  if (patch.endsAt !== undefined) set.endsAt = patch.endsAt;
  if (patch.totalMarks !== undefined) set.totalMarks = patch.totalMarks;
  if (patch.passingMarks !== undefined) set.passingMarks = patch.passingMarks;
  if (patch.attemptLimit !== undefined) set.attemptLimit = patch.attemptLimit;
  if (patch.resultsReleased !== undefined) set.resultsReleased = patch.resultsReleased;

  await col<ClassExamDoc>(db, "classExams").updateOne(
    { _id: toObjectId(id) } as never,
    { $set: set }
  );
  return { ok: true as const };
}

/**
 * Replace the whole question list (create/edit/reorder in one atomic write).
 * Recomputes totalMarks from the questions so the two can never drift.
 */
export async function replaceQuestions(
  db: Db,
  examId: string | ObjectId,
  questions: Array<Omit<ExamQuestion, "autoGradable"> & { autoGradable?: boolean }>
) {
  const withFlags: ExamQuestion[] = questions.map((q) => ({
    ...q,
    autoGradable: isAutoGradable(q.type),
  }));
  const total = withFlags.reduce((sum, q) => sum + q.marks, 0);
  const res = await col<ClassExamDoc>(db, "classExams").findOneAndUpdate(
    { _id: toObjectId(examId) } as never,
    { $set: { questions: withFlags, totalMarks: total, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!res) return { ok: false as const, reason: "not_found" as const };
  return { ok: true as const, totalMarks: total, questionCount: withFlags.length };
}

export async function publishExam(db: Db, examId: string | ObjectId) {
  const exam = await col<ClassExamDoc>(db, "classExams").findOne({ _id: toObjectId(examId) } as never);
  if (!exam) return { ok: false as const, reason: "not_found" as const };
  // Never publish an exam with no questions — students would see an empty paper.
  if ((exam.questions ?? []).length === 0) {
    return { ok: false as const, reason: "no_questions" as const };
  }
  await col<ClassExamDoc>(db, "classExams").updateOne(
    { _id: exam._id } as never,
    { $set: { status: "published", updatedAt: new Date() } }
  );
  return { ok: true as const };
}

export async function deleteExam(db: Db, examId: string | ObjectId) {
  const eid = toObjectId(examId);
  const res = await col<ClassExamDoc>(db, "classExams").deleteOne({ _id: eid } as never);
  if (res.deletedCount === 0) return { ok: false as const, reason: "not_found" as const };
  await col<ExamAttemptDoc>(db, "examAttempts").deleteMany({ examId: eid } as never);
  await col(db, "notifications").deleteMany({ "data.exam_id": eid.toHexString() } as never);
  return { ok: true as const };
}

/* --------------------------- Student side --------------------------- */

/**
 * Start (or resume) an attempt.
 *
 * Attempt allocation is race-safe: a unique index on
 * (examId, studentId, attemptNumber) plus a re-read on duplicate-key means two
 * concurrent submits can never create two first attempts.
 */
export async function startAttempt(
  db: Db,
  examId: string | ObjectId,
  studentId: string | ObjectId
) {
  const exam = await col<ClassExamDoc>(db, "classExams").findOne({ _id: toObjectId(examId) } as never);
  if (!exam) return { ok: false as const, reason: "not_found" as const };
  if (exam.status !== "published") return { ok: false as const, reason: "not_open" as const };
  const now = new Date();
  if (exam.startsAt && exam.startsAt.getTime() > now.getTime()) {
    return { ok: false as const, reason: "not_started" as const };
  }
  if (exam.endsAt && exam.endsAt.getTime() < now.getTime()) {
    return { ok: false as const, reason: "closed" as const };
  }

  const sid = toObjectId(studentId);

  const maxScore = (exam.questions ?? []).reduce((sum, q) => sum + q.marks, 0) || exam.totalMarks;

  /**
   * Attempt allocation is race-safe.
   *
   * A read-then-insert (`findOne` + `countDocuments` + `insertOne`) is NOT: two
   * concurrent starts can both observe zero attempts, and one of them can even
   * observe the count *after* the other's insert landed, allocating attempt #2
   * while the resume check for #1 was still stale. That produced two open
   * attempts for one student.
   *
   * Instead each allocation is an atomic `findOneAndUpdate(..., upsert)` on the
   * unique `(examId, studentId, attemptNumber)` key, so exactly one caller can
   * ever create a given attempt. Losing callers re-evaluate state and either
   * resume the winner or take the next number.
   */
  for (let round = 0; round < 6; round += 1) {
    const existing = await col<ExamAttemptDoc>(db, "examAttempts")
      .find({ examId: exam._id, studentId: sid } as never)
      .sort({ attemptNumber: -1 })
      .limit(1)
      .next();
    if (existing?.status === "in_progress") {
      return { ok: true as const, attemptId: existing._id, resumed: true as const };
    }
    const used = await col<ExamAttemptDoc>(db, "examAttempts").countDocuments({
      examId: exam._id,
      studentId: sid,
    } as never);
    if (used >= exam.attemptLimit) return { ok: false as const, reason: "no_attempts" as const };

    // Derive the number from the latest row (not the count) so a concurrent
    // insert can never hand two callers the same number with different rows.
    const latest = await col<ExamAttemptDoc>(db, "examAttempts")
      .find({ examId: exam._id, studentId: sid } as never)
      .sort({ attemptNumber: -1 })
      .limit(1)
      .next();
    const attemptNumber = Math.max(used, latest?.attemptNumber ?? 0) + 1;
    try {
      const row = await col<ExamAttemptDoc>(db, "examAttempts").findOneAndUpdate(
        { examId: exam._id, studentId: sid, attemptNumber } as never,
        {
          $setOnInsert: {
            examId: exam._id,
            studentId: sid,
            attemptNumber,
            status: "in_progress",
            answers: [],
            startedAt: now,
            submittedAt: null,
            score: null,
            autoScore: null,
            manualScore: null,
            maxScore,
            percentage: null,
            passed: null,
            gradedBy: null,
            gradedAt: null,
            graderNotes: null,
            createdAt: now,
            updatedAt: now,
          },
        } as never,
        { upsert: true, returnDocument: "after" }
      );
      if (row?._id) {
        return { ok: true as const, attemptId: row._id, resumed: false as const };
      }
    } catch (err: unknown) {
      // A concurrent caller created this attempt number first: re-evaluate.
      if (err instanceof Error && /duplicate key/i.test(err.message)) continue;
      throw err;
    }
  }

  // Contended start: fall back to whatever attempt currently exists.
  const settled = await col<ExamAttemptDoc>(db, "examAttempts")
    .find({ examId: exam._id, studentId: sid } as never)
    .sort({ attemptNumber: -1 })
    .limit(1)
    .next();
  if (settled?.status === "in_progress") {
    return { ok: true as const, attemptId: settled._id, resumed: true as const };
  }
  return { ok: false as const, reason: "no_attempts" as const };
}

/** Deterministic auto-grading for one answer set. */
function autoGradeQuestion(
  question: ExamQuestion,
  answer: { optionIds: string[]; text: string; matchedPairs: Array<{ id: string; right: string }>; numeric: number | null }
): { awarded: number | null; auto: boolean } {
  if (!isAutoGradable(question.type)) return { awarded: null, auto: false };

  if (question.type === "mcq" || question.type === "true_false") {
    const correct = question.options.filter((o) => o.isCorrect).map((o) => o.id);
    const picked = [...answer.optionIds].sort();
    const expected = [...correct].sort();
    return {
      awarded: picked.length === expected.length && picked.every((v, i) => v === expected[i])
        ? question.marks
        : 0,
      auto: true,
    };
  }

  if (question.type === "multiple_select") {
    const correct = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id));
    const picked = new Set(answer.optionIds);
    if (picked.size === 0) return { awarded: 0, auto: true };
    let hits = 0;
    let wrong = 0;
    for (const id of picked) {
      if (correct.has(id)) hits += 1;
      else wrong += 1;
    }
    if (wrong > 0) return { awarded: 0, auto: true };
    const ratio = hits / Math.max(correct.size, 1);
    // Partial credit proportional to correct selections, no penalty for omissions.
    return { awarded: Math.round(question.marks * ratio * 100) / 100, auto: true };
  }

  if (question.type === "fill_blank") {
    const normalized = answer.text.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) return { awarded: 0, auto: true };
    const accepted = question.correctAnswers.map((a) =>
      a.trim().toLowerCase().replace(/\s+/g, " ")
    );
    return { awarded: accepted.includes(normalized) ? question.marks : 0, auto: true };
  }

  if (question.type === "matching") {
    if (answer.matchedPairs.length === 0) return { awarded: 0, auto: true };
    let correctCount = 0;
    for (const pair of answer.matchedPairs) {
      const expected = question.pairs.find((p) => p.id === pair.id);
      if (expected && expected.right.trim().toLowerCase() === pair.right.trim().toLowerCase()) {
        correctCount += 1;
      }
    }
    const ratio = correctCount / Math.max(question.pairs.length, 1);
    return { awarded: Math.round(question.marks * ratio * 100) / 100, auto: true };
  }

  if (question.type === "numerical") {
    const value = answer.numeric;
    if (value === null || !Number.isFinite(value)) return { awarded: 0, auto: true };
    if (question.numericRange) {
      const inRange = value >= question.numericRange.min && value <= question.numericRange.max;
      return { awarded: inRange ? question.marks : 0, auto: true };
    }
    const accepted = question.correctAnswers
      .map((a) => Number(a))
      .filter((n) => Number.isFinite(n));
    const exact = accepted.some((n) => Math.abs(n - value) < 1e-9);
    const tolerance = accepted.some((n) => Math.abs(n - value) <= Math.max(Math.abs(n) * 0.001, 1e-6));
    return { awarded: exact || tolerance ? question.marks : 0, auto: true };
  }

  return { awarded: null, auto: false };
}

export interface SubmitAttemptInput {
  examId: string | ObjectId;
  studentId: string | ObjectId;
  attemptId?: string | ObjectId;
  answers: Array<{
    questionId: string;
    optionIds: string[];
    text: string;
    matchedPairs: Array<{ id: string; right: string }>;
    numeric: number | null;
    fileUrl: string | null;
  }>;
}

/**
 * Submit an attempt exactly once.
 *
 * The update filter requires `status: "in_progress"`, so duplicate submissions
 * (double-click, retry after a network error) match nothing and return the
 * already-submitted attempt instead of overwriting it.
 */
export async function submitAttempt(
  db: Db,
  input: SubmitAttemptInput
) {
  const exam = await col<ClassExamDoc>(db, "classExams").findOne({ _id: toObjectId(input.examId) } as never);
  if (!exam) return { ok: false as const, reason: "not_found" as const };
  const sid = toObjectId(input.studentId);

  const attempt = input.attemptId
    ? await col<ExamAttemptDoc>(db, "examAttempts").findOne({
        _id: toObjectId(input.attemptId),
        examId: exam._id,
        studentId: sid,
      } as never)
    : await col<ExamAttemptDoc>(db, "examAttempts").findOne({
        examId: exam._id,
        studentId: sid,
        status: "in_progress",
      } as never, { sort: { attemptNumber: -1 } });
  if (!attempt) return { ok: false as const, reason: "not_found" as const };

  if (attempt.status !== "in_progress") {
    return { ok: true as const, attempt: serialize(attempt), duplicate: true as const };
  }

  const byQuestion = new Map<string, ExamAnswer>();
  for (const q of exam.questions ?? []) {
    byQuestion.set(q.id, {
      questionId: q.id,
      optionIds: [],
      text: "",
      matchedPairs: [],
      numeric: null,
      fileUrl: null,
      awardedMarks: null,
      autoGraded: false,
      graderId: null,
      graderNotes: null,
    });
  }
  for (const raw of input.answers) {
    const target = byQuestion.get(raw.questionId);
    // Unknown question ids are dropped rather than stored.
    if (!target) continue;
    target.optionIds = raw.optionIds.slice(0, 12);
    target.text = raw.text.slice(0, 20000);
    target.matchedPairs = raw.matchedPairs.slice(0, 20);
    target.numeric = typeof raw.numeric === "number" && Number.isFinite(raw.numeric) ? raw.numeric : null;
    target.fileUrl = typeof raw.fileUrl === "string" && raw.fileUrl.startsWith("/api/files/") ? raw.fileUrl : null;
  }

  let autoScore = 0;
  let hasManual = false;
  for (const [qid, answer] of byQuestion) {
    const question = (exam.questions ?? []).find((q) => q.id === qid);
    if (!question) continue;
    const graded = autoGradeQuestion(question, answer);
    answer.autoGraded = graded.auto;
    if (graded.auto && graded.awarded !== null) {
      answer.awardedMarks = graded.awarded;
      autoScore += graded.awarded;
    } else {
      hasManual = true;
    }
  }
  autoScore = Math.round(autoScore * 100) / 100;

  const maxScore = (exam.questions ?? []).reduce((s, q) => s + q.marks, 0) || exam.totalMarks;
  const answers = [...byQuestion.values()];
  // When every question auto-graded, the attempt is fully scored; otherwise it
  // waits for a teacher (score stays null, never estimated).
  const fullyAuto = !hasManual;
  const score = fullyAuto ? autoScore : null;
  const percentage = fullyAuto && maxScore > 0 ? Math.round((autoScore / maxScore) * 10000) / 100 : null;

  const now = new Date();
  const updated = await col<ExamAttemptDoc>(db, "examAttempts").findOneAndUpdate(
    { _id: attempt._id, status: "in_progress" } as never,
    {
      $set: {
        answers,
        status: fullyAuto ? "graded" : "submitted",
        submittedAt: now,
        autoScore,
        score,
        maxScore,
        percentage,
        passed: fullyAuto ? autoScore >= exam.passingMarks : null,
        gradedAt: fullyAuto ? now : null,
        updatedAt: now,
      },
    },
    { returnDocument: "after" }
  );
  if (!updated) {
    const again = await col<ExamAttemptDoc>(db, "examAttempts").findOne({ _id: attempt._id } as never);
    return { ok: true as const, attempt: again ? serialize(again) : null, duplicate: true as const };
  }
  return { ok: true as const, attempt: serialize(updated), duplicate: false as const, needsGrading: !fullyAuto };
}

/* --------------------------- Teacher results --------------------------- */

export interface ExamResultsSummary {
  exam: Record<string, unknown>;
  totals: {
    assigned: number;
    attempted: number;
    notAttempted: number;
    graded: number;
    awaitingGrading: number;
    passed: number;
    failed: number;
    averageScore: number | null;
    highestScore: number | null;
    lowestScore: number | null;
    averagePercentage: number | null;
    passRate: number | null;
  };
  questionPerformance: Array<{
    questionId: string;
    prompt: string;
    marks: number;
    type: ExamQuestionType;
    autoGradable: boolean;
    attempted: number;
    averageAwarded: number | null;
  }>;
  rows: Array<{
    attemptId: string;
    studentId: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    attemptNumber: number;
    status: string;
    score: number | null;
    maxScore: number;
    percentage: number | null;
    passed: boolean | null;
    submittedAt: Date | null;
    needsGrading: boolean;
  }>;
  hasMore: boolean;
}

/**
 * Real results for one exam. Every number is computed from actual attempt
 * rows; students with no attempt are reported as "not attempted" only when the
 * class roster is available.
 */
export async function examResults(
  db: Db,
  examId: string | ObjectId,
  opts: { limit?: number; offset?: number } = {}
): Promise<ExamResultsSummary | null> {
  const exam = await col<ClassExamDoc>(db, "classExams").findOne({ _id: toObjectId(examId) } as never);
  if (!exam) return null;

  const attempts = await col<ExamAttemptDoc>(db, "examAttempts")
    .find({ examId: exam._id } as never)
    .sort({ submittedAt: -1, _id: -1 })
    .limit(2000)
    .toArray();

  // Latest attempt per student.
  const latest = new Map<string, ExamAttemptDoc>();
  for (const a of attempts) {
    const key = a.studentId.toHexString();
    const cur = latest.get(key);
    if (!cur || a.attemptNumber > cur.attemptNumber) latest.set(key, a);
  }

  const roster = await col(db, "users")
    .find({ role: "student", classGrade: exam.classGrade } as never)
    .project({ username: 1, displayName: 1, avatarUrl: 1 })
    .limit(1000)
    .toArray();
  const rosterById = new Map(
    roster.map((r) => {
      const raw = r as unknown as Record<string, unknown>;
      const id =
        raw._id && typeof raw._id === "object" && "toHexString" in raw._id
          ? (raw._id as { toHexString(): string }).toHexString()
          : String(raw._id);
      return [id, raw] as const;
    })
  );

  const rows: ExamResultsSummary["rows"] = [];
  for (const a of attempts) {
    const sid = a.studentId.toHexString();
    const profile = rosterById.get(sid);
    const needsGrading = a.status === "submitted" || a.answers.some((x) => x.awardedMarks === null);
    rows.push({
      attemptId: a._id.toHexString(),
      studentId: sid,
      username: (profile?.username ?? null) as string | null,
      displayName: (profile?.displayName ?? null) as string | null,
      avatarUrl: (profile?.avatarUrl ?? null) as string | null,
      attemptNumber: a.attemptNumber,
      status: a.status,
      score: a.score,
      maxScore: a.maxScore,
      percentage: a.percentage,
      passed: a.passed,
      submittedAt: a.submittedAt,
      needsGrading,
    });
  }

  // Students who never attempted (only when we have the real roster).
  for (const [id, profile] of rosterById) {
    if (latest.has(id)) continue;
    rows.push({
      attemptId: "",
      studentId: id,
      username: (profile.username ?? null) as string | null,
      displayName: (profile.displayName ?? null) as string | null,
      avatarUrl: (profile.avatarUrl ?? null) as string | null,
      attemptNumber: 0,
      status: "not_attempted",
      score: null,
      maxScore: (exam.questions ?? []).reduce((s, q) => s + q.marks, 0) || exam.totalMarks,
      percentage: null,
      passed: null,
      submittedAt: null,
      needsGrading: false,
    });
  }

  const attempted = rows.filter((r) => r.status !== "not_attempted");
  const graded = attempted.filter((r) => r.score !== null);
  const scores = graded.map((r) => r.score as number);
  const percentages = graded.map((r) => r.percentage as number);
  const passed = graded.filter((r) => r.passed === true).length;
  const failed = graded.filter((r) => r.passed === false).length;

  const questionPerformance = (exam.questions ?? []).map((q) => {
    const perQuestion = attempts
      .flatMap((a) => a.answers)
      .filter((ans) => ans.questionId === q.id && ans.awardedMarks !== null);
    const total = perQuestion.reduce((s, ans) => s + (ans.awardedMarks as number), 0);
    return {
      questionId: q.id,
      prompt: q.prompt.slice(0, 160),
      marks: q.marks,
      type: q.type,
      autoGradable: q.autoGradable,
      attempted: perQuestion.length,
      averageAwarded:
        perQuestion.length > 0 ? Math.round((total / perQuestion.length) * 100) / 100 : null,
    };
  });

  const offset = Math.max(0, opts.offset ?? 0);
  const limit = safeLimit(opts.limit, 50, 25);

  return {
    exam: serialize(exam) as unknown as Record<string, unknown>,
    totals: {
      assigned: roster.length,
      attempted: attempted.length,
      notAttempted: Math.max(0, roster.length - attempted.length),
      graded: graded.length,
      awaitingGrading: attempted.filter((r) => r.needsGrading).length,
      passed,
      failed,
      averageScore: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
      highestScore: scores.length > 0 ? Math.max(...scores) : null,
      lowestScore: scores.length > 0 ? Math.min(...scores) : null,
      averagePercentage: percentages.length > 0 ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 100) / 100 : null,
      passRate: graded.length > 0 ? Math.round((passed / graded.length) * 100) : null,
    },
    questionPerformance,
    rows: rows.slice(offset, offset + limit),
    hasMore: offset + Math.min(rows.length, offset + limit) < rows.length,
  };
}

/** Apply teacher marks and recompute the attempt total. */
export async function gradeAttempt(
  db: Db,
  attemptId: string | ObjectId,
  graderId: string | ObjectId,
  input: {
    marks: Array<{ questionId: string; awardedMarks: number | null; notes?: string | null }>;
    graderNotes?: string | null;
  }
) {
  const attempt = await col<ExamAttemptDoc>(db, "examAttempts").findOne({ _id: toObjectId(attemptId) } as never);
  if (!attempt) return { ok: false as const, reason: "not_found" as const };
  const exam = await col<ClassExamDoc>(db, "classExams").findOne({ _id: attempt.examId } as never);
  if (!exam) return { ok: false as const, reason: "not_found" as const };

  const questions = new Map((exam.questions ?? []).map((q) => [q.id, q]));
  const awarded = new Map(input.marks.map((m) => [m.questionId, m]));

  const answers: ExamAnswer[] = attempt.answers.map((a) => {
    const patch = awarded.get(a.questionId);
    const question = questions.get(a.questionId);
    if (!patch) {
      // Untouched question: keep an existing auto mark, otherwise still pending.
      return a;
    }
    if (patch.awardedMarks === null) return { ...a, awardedMarks: null };
    if (question && patch.awardedMarks > question.marks) {
      return { ...a, awardedMarks: question.marks };
    }
    return {
      ...a,
      awardedMarks: patch.awardedMarks,
      autoGraded: false,
      graderId: toObjectId(graderId),
      graderNotes: patch.notes?.slice(0, 2000) ?? a.graderNotes,
    };
  });

  const manualScore = answers.reduce((sum, a) => sum + (a.awardedMarks ?? 0), 0);
  const allGraded = answers.every((a) => a.awardedMarks !== null);
  const maxScore = (exam.questions ?? []).reduce((s, q) => s + q.marks, 0) || exam.totalMarks;
  const score = allGraded ? Math.round(manualScore * 100) / 100 : null;
  const percentage = score !== null && maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : null;

  await col<ExamAttemptDoc>(db, "examAttempts").updateOne(
    { _id: attempt._id } as never,
    {
      $set: {
        answers,
        manualScore,
        score,
        percentage,
        passed: score !== null ? score >= exam.passingMarks : null,
        status: allGraded ? "graded" : "submitted",
        gradedBy: toObjectId(graderId),
        gradedAt: new Date(),
        graderNotes: input.graderNotes?.slice(0, 5000) ?? null,
        updatedAt: new Date(),
      },
    }
  );
  return { ok: true as const, allGraded, score };
}

/** Release results to students and notify each graded student exactly once. */
export async function releaseResults(
  db: Db,
  examId: string | ObjectId,
  actorId: string | ObjectId,
  options: { notify?: boolean } = {}
) {
  const exam = await col<ClassExamDoc>(db, "classExams").findOne({ _id: toObjectId(examId) } as never);
  if (!exam) return { ok: false as const, reason: "not_found" as const };

  await col<ClassExamDoc>(db, "classExams").updateOne(
    { _id: exam._id } as never,
    { $set: { resultsReleased: true, updatedAt: new Date() } }
  );
  await logAudit(db, {
    actorId: String(actorId),
    action: "exam.results.released",
    targetType: "class_exam",
    targetId: exam._id.toHexString(),
    details: { title: exam.title },
  });

  if (options.notify !== false) {
    const graded = await col<ExamAttemptDoc>(db, "examAttempts")
      .find({ examId: exam._id, status: "graded" } as never)
      .limit(1000)
      .toArray();
    for (const a of graded) {
      await createNotification(db, {
        recipientId: a.studentId,
        actorId: actorId,
        type: "exam_result_released",
        title: "Exam results released",
        message: `Results for "${exam.title}" are now available.`,
        data: { exam_id: exam._id.toHexString(), attempt_id: a._id.toHexString() },
      });
    }
  }
  return { ok: true as const };
}

/** A student's own attempt list (never another student's). */
export async function studentAttempts(db: Db, examId: string | ObjectId, studentId: string | ObjectId) {
  const rows = await col<ExamAttemptDoc>(db, "examAttempts")
    .find({ examId: toObjectId(examId), studentId: toObjectId(studentId) } as never)
    .sort({ attemptNumber: -1 })
    .limit(20)
    .toArray();
  return serializeMany(rows);
}

export async function getAttempt(db: Db, attemptId: string | ObjectId) {
  const row = await col<ExamAttemptDoc>(db, "examAttempts").findOne({ _id: toObjectId(attemptId) } as never);
  return row ? serialize(row) : null;
}

/** Notify a class about a published exam (idempotent per exam+student). */
export async function notifyExamPublished(
  db: Db,
  exam: { _id: ObjectId; title: string; classGrade: string },
  actorId: string | ObjectId
) {
  const students = await col(db, "users")
    .find({ role: "student", classGrade: exam.classGrade } as never)
    .project({ _id: 1 })
    .limit(1000)
    .toArray();
  for (const s of students) {
    const studentId = (s as unknown as { _id: ObjectId })._id;
    // Duplicate-key safe: retries cannot double-notify.
    await createNotification(db, {
      recipientId: studentId,
      actorId,
      type: "exam_published",
      title: "New exam published",
      message: exam.title,
      data: { exam_id: exam._id.toHexString() },
      dedupeKey: `exam_published:${exam._id.toHexString()}:${studentId.toHexString()}`,
    });
  }
}
