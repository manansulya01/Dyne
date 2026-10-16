import { NextResponse } from "next/server";
import { col, type UserDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { examQuestionsReplaceSchema } from "@/lib/validation";
import { canManageExam, getExam, replaceQuestions } from "@/lib/db/classExams";
import { toExamQuestionJSON } from "@/lib/db/contracts";
import { logAudit } from "@/lib/security/audit";
import { guardRate, jsonError, withUser } from "@/lib/security/authorize";
interface Params {
  params: Promise<{ id: string }>;
}
/**
 * Exam question set (create / edit / reorder / delete in one atomic write).
 * Owner teacher or admin only. Total marks are recomputed from the questions.
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
  if (!isManager) {
    if (user.role !== "student") return jsonError(403, "Forbidden");
    const me = await col<UserDoc>(db, "users").findOne({ _id: toObjectId(user.id) } as never, {
      projection: { classGrade: 1 },
    });
    if (!me?.classGrade || me.classGrade !== String(raw.classGrade ?? "")) {
      return jsonError(404, "Exam not found");
    }
    if (String(raw.status ?? "draft") !== "published") return jsonError(404, "Exam not found");
  }
  const includeAnswers = isManager;
  return NextResponse.json({
    questions: ((raw.questions ?? []) as Array<Record<string, unknown>>).map((q) =>
      toExamQuestionJSON(q, includeAnswers)
    ),
    total_marks: Number(raw.totalMarks ?? 0),
  });
}
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Exam not found");
  const exam = await getExam(db, id);
  if (!exam) return jsonError(404, "Exam not found");
  if (!canManageExam(exam as unknown as Record<string, unknown> as { createdBy: unknown }, user)) {
    return jsonError(403, "Forbidden");
  }
  const body = await request.json().catch(() => null);
  const validated = examQuestionsReplaceSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const result = await replaceQuestions(db, id, validated.data.questions as never);
  if (!result.ok) return jsonError(404, "Exam not found");
  await logAudit(db, {
    actorId: user.id,
    action: "exam.questions.replace",
    targetType: "class_exam",
    targetId: id,
    details: { questionCount: result.questionCount, totalMarks: result.totalMarks },
  });
  return NextResponse.json({
    success: true,
    questionCount: result.questionCount,
    totalMarks: result.totalMarks,
  });
}
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Exam not found");
  const exam = await getExam(db, id);
  if (!exam) return jsonError(404, "Exam not found");
  if (!canManageExam(exam as unknown as Record<string, unknown> as { createdBy: unknown }, user)) {
    return jsonError(403, "Forbidden");
  }
  const result = await replaceQuestions(db, id, []);
  if (!result.ok) return jsonError(404, "Exam not found");
  await logAudit(db, {
    actorId: user.id,
    action: "exam.questions.clear",
    targetType: "class_exam",
    targetId: id,
  });
  return NextResponse.json({ success: true });
}