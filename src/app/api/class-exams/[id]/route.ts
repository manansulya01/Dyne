import { NextResponse } from "next/server";
import { col, type UserDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { classExamUpdateSchema } from "@/lib/validation";
import {
  canManageExam,
  deleteExam,
  getExam,
  releaseResults,
  studentAttempts,
  updateExam,
} from "@/lib/db/classExams";
import { toClassExamJSON, toExamAttemptJSON, toExamQuestionJSON } from "@/lib/db/contracts";
import { logAudit } from "@/lib/security/audit";
import { guardRate, jsonError, withUser } from "@/lib/security/authorize";
import { hasPermission } from "@/lib/permissions";
interface Params {
  params: Promise<{ id: string }>;
}
/**
 * A single class exam.
 *
 * Visibility is decided server-side:
 *   - owner teacher / admin / moderator → full view INCLUDING correct answers
 *   - student in the exam's class, published → questions WITHOUT answers
 *   - everyone else → 404 (no existence oracle)
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
  const isModerator = hasPermission(user.role, "exams.manage");
  let studentMode = false;
  if (!isManager && !isModerator) {
    if (user.role !== "student") return jsonError(404, "Exam not found");
    const me = await col<UserDoc>(db, "users").findOne({ _id: toObjectId(user.id) } as never, {
      projection: { classGrade: 1 },
    });
    if (!me?.classGrade || me.classGrade !== String(raw.classGrade ?? "")) {
      return jsonError(404, "Exam not found");
    }
    if (String(raw.status ?? "draft") !== "published") return jsonError(404, "Exam not found");
    studentMode = true;
  }
  const includeAnswers = !studentMode;
  const questions = ((raw.questions ?? []) as Array<Record<string, unknown>>).map((q) =>
    toExamQuestionJSON(q, includeAnswers)
  );
  const response: Record<string, unknown> = {
    exam: {
      ...toClassExamJSON(raw),
      // Question paper mode: printable paper is only offered to managers.
      printable: includeAnswers && String(raw.mode ?? "") === "question_paper",
    },
    questions,
  };
  if (studentMode) {
    const attempts = await studentAttempts(db, id, user.id);
    const { searchParams } = new URL(request.url);
    if (searchParams.get("attempts") !== "false") {
      response.myAttempts = attempts.map((a) =>
        toExamAttemptJSON(a as unknown as Record<string, unknown>)
      );
    }
    // Students never see other students' data, and never see answers before
    // the exam is closed.
    if (String(raw.status ?? "") !== "closed" && !raw.resultsReleased) {
      response.answersHidden = true;
    }
  }
  return NextResponse.json(response);
}
export async function PATCH(request: Request, { params }: Params) {
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
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  // `releaseResults` is accepted here as an explicit alias so the console's
  // "release results" control works from either surface. It is never ignored
  // silently, which would leave the exam unreleased with a 200 response.
  if (body && body.releaseResults === true) {
    const released = await releaseResults(db, id, user.id);
    if (!released.ok) return jsonError(404, "Exam not found");
    const updated = await getExam(db, id);
    return NextResponse.json({
      success: true,
      resultsReleased: true,
      exam: updated ? toClassExamJSON(updated as unknown as Record<string, unknown>) : null,
    });
  }
  const validated = classExamUpdateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  const result = await updateExam(db, id, {
    title: d.title,
    description: d.description,
    subject: d.subject,
    classGrade: d.classGrade,
    mode: d.mode,
    status: d.status,
    instructions: d.instructions,
    durationMinutes: d.durationMinutes,
    startsAt: d.startsAt ? new Date(d.startsAt) : undefined,
    endsAt: d.endsAt === undefined ? undefined : d.endsAt ? new Date(d.endsAt) : null,
    totalMarks: d.totalMarks,
    passingMarks: d.passingMarks,
    attemptLimit: d.attemptLimit,
  });
  if (!result.ok) {
    if (result.reason === "not_found") return jsonError(404, "Exam not found");
    return jsonError(400, result.reason === "bad_marks" ? "Passing marks cannot exceed total marks" : "Invalid window");
  }
  await logAudit(db, {
    actorId: user.id,
    action: d.status ? `exam.${d.status}` : "exam.update",
    targetType: "class_exam",
    targetId: id,
    details: { fields: Object.keys(d) },
  });
  const fresh = await getExam(db, id);
  return NextResponse.json({
    exam: fresh ? toClassExamJSON(fresh as unknown as Record<string, unknown>) : null,
  });
}
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;
  const exam = await getExam(db, id);
  if (!exam) return jsonError(404, "Exam not found");
  if (!canManageExam(exam as unknown as Record<string, unknown> as { createdBy: unknown }, user)) {
    return jsonError(403, "Forbidden");
  }
  const result = await deleteExam(db, id);
  if (!result.ok) return jsonError(404, "Exam not found");
  await logAudit(db, {
    actorId: user.id,
    action: "exam.delete",
    targetType: "class_exam",
    targetId: id,
    details: { title: (exam as unknown as Record<string, unknown>).title ?? null },
  });
  return NextResponse.json({ success: true });
}