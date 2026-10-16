import { NextResponse } from "next/server";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { examGradeSchema } from "@/lib/validation";
import { canManageExam, getAttempt, getExam, gradeAttempt } from "@/lib/db/classExams";
import { toExamQuestionJSON, toExamAttemptJSON } from "@/lib/db/contracts";
import { logAudit } from "@/lib/security/audit";
import { guardRate, jsonError, withUser } from "@/lib/security/authorize";
interface Params {
  params: Promise<{ id: string; attemptId: string }>;
}
/**
 * One attempt's full detail for grading (owner teacher / admin only).
 *
 * Returns the student's answers alongside the questions. Correct answers are
 * included here (and only here) so a teacher can grade written responses.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id, attemptId } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  if (!objectIdSchema.safeParse(id).success || !objectIdSchema.safeParse(attemptId).success) {
    return jsonError(404, "Attempt not found");
  }
  const exam = await getExam(db, id);
  if (!exam) return jsonError(404, "Exam not found");
  if (!canManageExam(exam as unknown as Record<string, unknown> as { createdBy: unknown }, user)) {
    return jsonError(403, "Forbidden");
  }
  const attempt = await getAttempt(db, attemptId);
  if (!attempt) return jsonError(404, "Attempt not found");
  const attemptRaw = attempt as unknown as Record<string, unknown>;
  if (String(attemptRaw.examId) !== id) return jsonError(404, "Attempt not found");
  const examRaw = exam as unknown as Record<string, unknown>;
  const questions = ((examRaw.questions ?? []) as Array<Record<string, unknown>>).map((q) =>
    toExamQuestionJSON(q, true)
  );
  const answers = ((attemptRaw.answers ?? []) as Array<Record<string, unknown>>).map((a) => ({
    question_id: String(a.questionId ?? ""),
    option_ids: (a.optionIds ?? []) as string[],
    text: String(a.text ?? ""),
    matched_pairs: (a.matchedPairs ?? []) as Array<{ id: string; right: string }>,
    numeric: (a.numeric ?? null) as number | null,
    file_url: (a.fileUrl ?? null) as string | null,
    awarded_marks: (a.awardedMarks ?? null) as number | null,
    auto_graded: Boolean(a.autoGraded ?? false),
    grader_notes: (a.graderNotes ?? null) as string | null,
  }));
  return NextResponse.json({
    attempt: toExamAttemptJSON(attemptRaw),
    questions,
    answers,
  });
}
const patchSchema = examGradeSchema;
/** Award marks per question and recompute the attempt total. */
export async function PATCH(request: Request, { params }: Params) {
  const { id, attemptId } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;
  if (!objectIdSchema.safeParse(id).success || !objectIdSchema.safeParse(attemptId).success) {
    return jsonError(404, "Attempt not found");
  }
  const exam = await getExam(db, id);
  if (!exam) return jsonError(404, "Exam not found");
  if (!canManageExam(exam as unknown as Record<string, unknown> as { createdBy: unknown }, user)) {
    return jsonError(403, "Forbidden");
  }
  const body = await request.json().catch(() => null);
  const validated = patchSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const result = await gradeAttempt(db, toObjectId(attemptId), user.id, {
    marks: validated.data.marks.map((m) => ({
      questionId: m.questionId,
      awardedMarks: m.awardedMarks,
      notes: m.notes ?? null,
    })),
    graderNotes: validated.data.graderNotes ?? null,
  });
  if (!result.ok) return jsonError(404, "Attempt not found");
  await logAudit(db, {
    actorId: user.id,
    action: "exam.grade",
    targetType: "exam_attempt",
    targetId: attemptId,
    details: { examId: id, score: result.score ?? null, allGraded: result.allGraded },
  });
  const fresh = await getAttempt(db, attemptId);
  return NextResponse.json({
    success: true,
    allGraded: result.allGraded,
    score: result.score ?? null,
    attempt: fresh ? toExamAttemptJSON(fresh as unknown as Record<string, unknown>) : null,
  });
}