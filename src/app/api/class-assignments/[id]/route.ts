import { NextResponse } from "next/server";
import { col, type UserDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { teacherAssignmentUpdateSchema } from "@/lib/validation";
import {
  canManageAssignment,
  deleteTeacherAssignment,
  getTeacherAssignment,
  updateTeacherAssignment,
} from "@/lib/db/teacherAssignments";
import { createNotification } from "@/lib/db/notifications";
import { toTeacherAssignmentJSON } from "@/lib/db/contracts";
import { logAudit } from "@/lib/security/audit";
import { guardRate, jsonError, withUser } from "@/lib/security/authorize";
interface Params {
  params: Promise<{ id: string }>;
}
/**
 * Single teacher assignment.
 *
 * GET — the owner teacher, an admin, or a student in the target class (read
 *       only, and never while the assignment is still a draft).
 * PATCH — owner teacher or admin only.
 * DELETE — owner teacher or admin only.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Assignment not found");
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  const assignment = await getTeacherAssignment(db, id);
  if (!assignment) return jsonError(404, "Assignment not found");
  const raw = assignment as unknown as Record<string, unknown>;
  const isOwner = canManageAssignment(raw as { createdBy: unknown }, user);
  const isAdmin = user.role === "admin" || user.role === "super_admin";
  if (!isOwner && !isAdmin) {
    // Students may read published assignments for their own class only.
    if (user.role !== "student") return jsonError(403, "Forbidden");
    const me = await col<UserDoc>(db, "users")
      .findOne({ _id: toObjectId(user.id) } as never, { projection: { classGrade: 1 } });
    const myGrade = (me?.classGrade ?? null) as string | null;
    if (!myGrade || myGrade !== String(raw.classGrade ?? "")) {
      return jsonError(403, "Forbidden");
    }
    if (String(raw.status ?? "draft") === "draft") {
      return jsonError(404, "Assignment not found");
    }
  }
  return NextResponse.json({
    assignment: toTeacherAssignmentJSON(raw),
  });
}
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Assignment not found");
  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;
  const assignment = await getTeacherAssignment(db, id);
  if (!assignment) return jsonError(404, "Assignment not found");
  const raw = assignment as unknown as Record<string, unknown>;
  if (!canManageAssignment(raw as { createdBy: unknown }, user)) {
    return jsonError(403, "Forbidden");
  }
  const body = await request.json().catch(() => null);
  const validated = teacherAssignmentUpdateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  const updated = await updateTeacherAssignment(db, id, {
    title: d.title,
    description: d.description,
    subject: d.subject,
    classGrade: d.classGrade,
    instructions: d.instructions,
    status: d.status,
    dueDate: d.dueDate === undefined ? undefined : d.dueDate ? new Date(d.dueDate) : null,
    publishAt: d.publishAt === undefined ? undefined : d.publishAt ? new Date(d.publishAt) : null,
    attachmentUrl: d.attachmentUrl,
    attachmentName: d.attachmentName,
    maxMarks: d.maxMarks,
  });
  if (!updated.ok) {
    return jsonError(updated.reason === "not_found" ? 404 : 400, "Could not update assignment");
  }
  const wasDraft = String(raw.status ?? "draft") === "draft";
  const nowPublished = d.status === "published" && wasDraft;
  await logAudit(db, {
    actorId: user.id,
    action: "assignment.update",
    targetType: "class_assignment",
    targetId: id,
    details: { fields: Object.keys(d) },
  });
  // First publish notifies the roster exactly once.
  let notified = 0;
  if (nowPublished) {
    const classGrade = String(d.classGrade ?? raw.classGrade ?? "");
    const students = await col<UserDoc>(db, "users")
      .find({ role: "student", classGrade } as never)
      .project({ _id: 1 })
      .limit(1000)
      .toArray();
    for (const s of students) {
      const sid = s._id;
      const inserted = await createNotification(db, {
        recipientId: sid,
        actorId: user.id,
        type: "assignment_published",
        title: "New assignment",
        message: String(d.title ?? raw.title ?? ""),
        data: { assignment_id: id, due_date: d.dueDate ?? null },
        dedupeKey: `assignment:${id}:${sid.toHexString()}`,
      });
      if (inserted) notified += 1;
    }
  }
  const fresh = await getTeacherAssignment(db, id);
  return NextResponse.json({
    assignment: fresh
      ? toTeacherAssignmentJSON(fresh as unknown as Record<string, unknown>)
      : null,
    notified,
  });
}
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;
  const assignment = await getTeacherAssignment(db, id);
  if (!assignment) return jsonError(404, "Assignment not found");
  if (!canManageAssignment(assignment as unknown as Record<string, unknown> as { createdBy: unknown }, user)) {
    return jsonError(403, "Forbidden");
  }
  const result = await deleteTeacherAssignment(db, id);
  if (!result.ok) return jsonError(404, "Assignment not found");
  await logAudit(db, {
    actorId: user.id,
    action: "assignment.delete",
    targetType: "class_assignment",
    targetId: id,
    details: { title: (assignment as unknown as Record<string, unknown>).title ?? null },
  });
  return NextResponse.json({ success: true });
}