import { NextResponse } from "next/server";
import { col, type UserDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { examSubmitSchema } from "@/lib/validation";
import {
  canManageExam,
  getExam,
  startAttempt,
  studentAttempts,
  submitAttempt,
} from "@/lib/db/classExams";
import { toExamAttemptJSON } from "@/lib/db/contracts";
import { guardRate, jsonError, withUser } from "@/lib/security/authorize";
interface Params {
  params: Promise<{ id: string }>;
}
/**
 * Student exam attempts for one exam.
 *
 * POST — start or resume an attempt (POST with `{ start: true }`), or submit
 *        answers. The student identity comes from the session only.
 * Race safety: attempts are keyed by (examId, studentId, attemptNumber) and
 * submission requires `status: "in_progress"`, so a double submit is a no-op
 * instead of an overwrite.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Exam not found");
  const exam = await getExam(db, id);
  if (!exam) return jsonError(404, "Exam not found");
  const raw = exam as unknown as Record<string, unknown>;
  const isManager = canManageExam(raw as { createdBy: unknown }, user);
  if (!isManager && user.role !== "student") return jsonError(403, "Forbidden");
  if (user.role === "student") {
    const me = await col<UserDoc>(db, "users").findOne({ _id: toObjectId(user.id) } as never, {
      projection: { classGrade: 1 },
    });
    if (!me?.classGrade || me.classGrade !== String(raw.classGrade ?? "")) {
      return jsonError(404, "Exam not found");
    }
    if (String(raw.status ?? "draft") !== "published") return jsonError(404, "Exam not found");
  }
  const attempts = await studentAttempts(db, id, user.id);
  // Scores stay hidden from a student until the exam owner releases results;
  // the exam's own manager (or an admin) always sees them.
  const revealScores = isManager || String(raw.status ?? "draft") === "closed" ||
    Boolean(raw.resultsReleased);
  return NextResponse.json({
    // Always the caller's own attempts — never another student's.
    attempts: attempts.map((a) =>
      toExamAttemptJSON(a as unknown as Record<string, unknown>, { revealScores })
    ),
    resultsReleased: Boolean(raw.resultsReleased),
  });
}
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Exam not found");
  const limited = guardRate(request, user.id, "examSubmissions");
  if (limited) return limited;
  if (user.role !== "student") {
    return jsonError(403, "Only students can take exams");
  }
  const me = await col<UserDoc>(db, "users").findOne({ _id: toObjectId(user.id) } as never, {
    projection: { classGrade: 1 },
  });
  const classGrade = me?.classGrade ?? null;
  const exam = await getExam(db, id);
  if (!exam) return jsonError(404, "Exam not found");
  const raw = exam as unknown as Record<string, unknown>;
  if (!classGrade || classGrade !== String(raw.classGrade ?? "")) {
    return jsonError(404, "Exam not found");
  }
  const body = await request.json().catch(() => ({}));
  const startRequested = (body as { start?: boolean }).start === true;
  if (startRequested) {
    const started = await startAttempt(db, id, user.id);
    if (!started.ok) {
      const status = started.reason === "no_attempts" ? 409 : started.reason === "not_found" ? 404 : 403;
      const message =
        started.reason === "no_attempts"
          ? "You have used all allowed attempts"
          : started.reason === "not_started"
            ? "This exam has not started yet"
            : started.reason === "closed"
              ? "This exam is closed"
              : "This exam is not open";
      return jsonError(status, message);
    }
    return NextResponse.json({
      attemptId: started.attemptId.toHexString(),
      resumed: started.resumed,
      durationMinutes: (raw.durationMinutes ?? null) as number | null,
    });
  }
  const validated = examSubmitSchema.safeParse({ ...(body as object), examId: id });
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  const result = await submitAttempt(db, {
    examId: id,
    // Session-derived identity only.
    studentId: user.id,
    attemptId: d.attemptId,
    answers: d.answers.map((a) => ({
      questionId: a.questionId,
      optionIds: a.optionIds,
      text: a.text,
      matchedPairs: a.matchedPairs,
      numeric: a.numeric,
      fileUrl: a.fileUrl,
    })),
  });
  if (!result.ok) return jsonError(404, "Exam not found");
  const attempt = result.attempt as unknown as Record<string, unknown> | null;
  const resultsReleased = Boolean(raw.resultsReleased);
  return NextResponse.json({
    // Never echo a score back before the owner releases results.
    attempt: attempt ? toExamAttemptJSON(attempt, { revealScores: resultsReleased }) : null,
    duplicate: result.duplicate,
    needsGrading: "needsGrading" in result ? result.needsGrading : false,
    // Scores stay hidden until the exam owner releases results.
    resultsReleased,
  });
}