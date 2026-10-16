import type { Db } from "mongodb";
import { NextResponse } from "next/server";
import { objectIdSchema } from "@/lib/mongo/ids";
import { examGradeSchema } from "@/lib/validation";
import {
  canManageExam,
  examResults,
  getExam,
  getAttempt,
  gradeAttempt,
  releaseResults,
} from "@/lib/db/classExams";
import { toExamAttemptJSON } from "@/lib/db/contracts";
import { logAudit } from "@/lib/security/audit";
import { guardRate, jsonError, withUser } from "@/lib/security/authorize";
interface Params {
  params: Promise<{ id: string }>;
}
/**
 * Teacher/admin exam results.
 *
 * GET  — aggregate results + per-student rows (real data only).
 * PATCH — grade one attempt's manual questions, or release results to students.
 * Access: owner teacher, admin, or `exams.grade` holders for the class.
 */
async function loadExamForManager(db: Db, id: string, user: { id: string; role: string }) {
  const exam = await getExam(db, id);
  if (!exam) return { error: NextResponse.json({ error: "Exam not found" }, { status: 404 }) } as const;
  const raw = exam as unknown as Record<string, unknown>;
  if (canManageExam(raw as { createdBy: unknown }, user)) return { exam, raw } as const;
  return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
}
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Exam not found");
  const loaded = await loadExamForManager(db, id, user);
  if ("error" in loaded) return loaded.error;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
  const results = await examResults(db, id, { limit, offset });
  if (!results) return jsonError(404, "Exam not found");
  await logAudit(db, {
    actorId: user.id,
    action: "exam.results.view",
    targetType: "class_exam",
    targetId: id,
    details: { rows: results.rows.length },
  });
  return NextResponse.json(results);
}
const patchSchema = examGradeSchema.extend({
  attemptId: objectIdSchema.optional(),
});
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Exam not found");
  const loaded = await loadExamForManager(db, id, user);
  if ("error" in loaded) return loaded.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  // Releasing results carries no per-question marks, so it is handled before
  // the grading schema (which requires a `marks` array) is applied.
  if (body && body.resultsReleased === true && !body.attemptId) {
    const released = await releaseResults(db, id, user.id);
    if (!released.ok) return jsonError(404, "Exam not found");
    return NextResponse.json({ success: true, resultsReleased: true });
  }

  const validated = patchSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  if (!d.attemptId) return jsonError(400, "attemptId is required to grade");
  const attempt = await getAttempt(db, d.attemptId);
  if (!attempt) return jsonError(404, "Attempt not found");
  const attemptRaw = attempt as unknown as Record<string, unknown>;
  if (String(attemptRaw.examId) !== id) return jsonError(404, "Attempt not found");
  const graded = await gradeAttempt(db, d.attemptId, user.id, {
    marks: d.marks.map((m) => ({
      questionId: m.questionId,
      awardedMarks: m.awardedMarks,
      notes: m.notes ?? null,
    })),
    graderNotes: d.graderNotes ?? null,
  });
  if (!graded.ok) return jsonError(404, "Attempt not found");
  await logAudit(db, {
    actorId: user.id,
    action: "exam.grade",
    targetType: "exam_attempt",
    targetId: d.attemptId,
    details: { examId: id, score: graded.score ?? null, allGraded: graded.allGraded },
  });
  const fresh = await getAttempt(db, d.attemptId);
  return NextResponse.json({
    success: true,
    allGraded: graded.allGraded,
    attempt: fresh ? toExamAttemptJSON(fresh as unknown as Record<string, unknown>) : null,
  });
}