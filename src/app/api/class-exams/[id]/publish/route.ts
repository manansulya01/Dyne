import { NextResponse } from "next/server";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { canManageExam, getExam, notifyExamPublished, publishExam } from "@/lib/db/classExams";
import { logAudit } from "@/lib/security/audit";
import { guardRate, jsonError, withUser } from "@/lib/security/authorize";
interface Params {
  params: Promise<{ id: string }>;
}
/**
 * Publish an exam. Refuses an exam with no questions, notifies the class
 * roster exactly once per student, and is audited.
 */
export async function POST(request: Request, { params }: Params) {
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
  const wasPublished = String((exam as unknown as Record<string, unknown>).status ?? "") === "published";
  const result = await publishExam(db, id);
  if (!result.ok) {
    if (result.reason === "no_questions") {
      return jsonError(409, "Add at least one question before publishing");
    }
    return jsonError(404, "Exam not found");
  }
  const raw = exam as unknown as Record<string, unknown>;
  await notifyExamPublished(
    db,
    {
      _id: toObjectId(id),
      title: String(raw.title ?? "Exam"),
      classGrade: String(raw.classGrade ?? ""),
    },
    user.id
  );
  await logAudit(db, {
    actorId: user.id,
    action: "exam.publish",
    targetType: "class_exam",
    targetId: id,
    details: { title: raw.title ?? null, alreadyPublished: wasPublished },
  });
  return NextResponse.json({ success: true });
}