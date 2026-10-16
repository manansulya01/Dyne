import { NextResponse } from "next/server";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { assignmentGradeSchema } from "@/lib/validation";
import { canManageAssignment, getTeacherAssignment, gradeSubmission } from "@/lib/db/teacherAssignments";
import { toSubmissionJSON } from "@/lib/db/contracts";
import { logAudit } from "@/lib/security/audit";
import { guardRate, jsonError, withPermission } from "@/lib/security/authorize";
interface Params {
  params: Promise<{ id: string }>;
}
/**
 * Grade one student's submission for an assignment.
 * Owner teacher or admin only; audited.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await withPermission("assignments.manage");
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Assignment not found");
  const assignment = await getTeacherAssignment(db, id);
  if (!assignment) return jsonError(404, "Assignment not found");
  if (!canManageAssignment(assignment as unknown as Record<string, unknown> as { createdBy: unknown }, user)) {
    return jsonError(403, "Forbidden");
  }
  const body = await request.json().catch(() => null);
  const validated = assignmentGradeSchema
    .extend({ studentId: objectIdSchema })
    .safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const result = await gradeSubmission(db, id, validated.data.studentId, user.id, {
    score: validated.data.score ?? null,
    feedback: validated.data.feedback ?? null,
  });
  if (!result.ok) {
    if (result.reason === "score_too_high") return jsonError(400, "Score exceeds the assignment's maximum marks");
    return jsonError(404, "Submission not found");
  }
  await logAudit(db, {
    actorId: user.id,
    action: "assignment.grade",
    targetType: "class_assignment",
    targetId: id,
    details: {
      studentId: validated.data.studentId,
      score: validated.data.score ?? null,
    },
  });
  const fresh = await db
    .collection("assignmentSubmissions")
    .findOne({
      assignmentId: toObjectId(id),
      studentId: toObjectId(validated.data.studentId),
    } as never);
  return NextResponse.json({
    success: true,
    submission: fresh ? toSubmissionJSON(fresh as Record<string, unknown>) : null,
  });
}