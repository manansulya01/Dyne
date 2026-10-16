import { NextResponse } from "next/server";
import { objectIdSchema } from "@/lib/mongo/ids";
import {
  assignmentMonitor,
  canAccessClass,
  canManageAssignment,
  getTeacherAssignment,
} from "@/lib/db/teacherAssignments";
import { logAudit } from "@/lib/security/audit";
import { jsonError, withPermission } from "@/lib/security/authorize";
interface Params {
  params: Promise<{ id: string }>;
}
/**
 * Assignment completion monitoring.
 *
 * Requires `assignments.monitor` (teacher/admin) AND either ownership of the
 * assignment or an authorized class. Every row is computed from real
 * submissions; nothing is fabricated.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await withPermission("assignments.monitor");
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Assignment not found");
  const assignment = await getTeacherAssignment(db, id);
  if (!assignment) return jsonError(404, "Assignment not found");
  const raw = assignment as unknown as Record<string, unknown>;
  if (!canManageAssignment(raw as { createdBy: unknown }, user)) {
    const allowed = await canAccessClass(db, user, String(raw.classGrade ?? ""));
    if (!allowed) return jsonError(403, "Forbidden");
  }
  const { searchParams } = new URL(request.url);
  const filterParam = searchParams.get("filter");
  const filter =
    filterParam === "completed" || filterParam === "not_completed" || filterParam === "overdue"
      ? filterParam
      : "all";
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
  const monitor = await assignmentMonitor(db, id, { limit, offset, filter });
  if (!monitor) return jsonError(404, "Assignment not found");
  await logAudit(db, {
    actorId: user.id,
    action: "assignment.monitor.view",
    targetType: "class_assignment",
    targetId: id,
    details: { filter, rows: monitor.rows.length },
  });
  return NextResponse.json({
    assignment: {
      id,
      title: String(raw.title ?? ""),
      subject: String(raw.subject ?? ""),
      class_grade: String(raw.classGrade ?? ""),
      status: String(raw.status ?? "draft"),
      due_date: raw.dueDate ?? null,
      max_marks: (raw.maxMarks ?? null) as number | null,
      instructions: (raw.instructions ?? null) as string | null,
    },
    totals: monitor.totals,
    rows: monitor.rows,
    hasMore: monitor.hasMore,
  });
}