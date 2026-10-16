import { NextResponse } from "next/server";
import { col, type UserDoc } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { teacherAssignmentCreateSchema } from "@/lib/validation";
import {
  assignableClassGrades,
  createTeacherAssignment,
  listTeacherAssignments,
} from "@/lib/db/teacherAssignments";
import { toTeacherAssignmentJSON } from "@/lib/db/contracts";
import { createNotification } from "@/lib/db/notifications";
import { logAudit } from "@/lib/security/audit";
import { guardRate, jsonError, withPermission, withUser } from "@/lib/security/authorize";
import { parseLimitParam } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";
/**
 * Teacher-authored class assignments.
 *
 * GET  — teachers see their own; admins may filter by any class.
 * POST — create + optionally publish. Publishing notifies the real class roster
 *        exactly once (dedupe key per assignment+student).
 */
export async function GET(request: Request) {
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const isAdmin = user.role === "admin" || user.role === "super_admin";
  if (!hasPermission(user.role, "assignments.monitor") && !isAdmin) {
    return jsonError(403, "Forbidden");
  }
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const status =
    statusParam === "draft" || statusParam === "published" || statusParam === "closed"
      ? statusParam
      : undefined;
  const classGrade = searchParams.get("classGrade") || undefined;
  const beforeCreatedAt = searchParams.get("before");
  const beforeId = searchParams.get("beforeId");
  let before: { createdAt: Date; id: string } | null = null;
  if (beforeCreatedAt) {
    const d = new Date(beforeCreatedAt);
    if (!isNaN(+d) && (!beforeId || objectIdSchema.safeParse(beforeId).success)) {
      before = { createdAt: d, id: beforeId ?? "" };
    }
  }
  const rows = await listTeacherAssignments(db, {
    // Teachers only ever see their own assignments; admins may see all.
    createdBy: isAdmin && searchParams.get("all") === "true" ? undefined : user.id,
    classGrade,
    status,
    limit: parseLimitParam(searchParams.get("limit"), 25, 50),
    before,
  });
  return NextResponse.json({
    assignments: rows.map((r) => toTeacherAssignmentJSON(r as unknown as Record<string, unknown>)),
    classes: await assignableClassGrades(db, user),
    cursor:
      rows.length > 0
        ? {
            before: String((rows[rows.length - 1] as unknown as { createdAt?: Date }).createdAt ?? ""),
            beforeId: String((rows[rows.length - 1] as unknown as { id?: string }).id ?? ""),
          }
        : null,
    hasMore: rows.length === parseLimitParam(searchParams.get("limit"), 25, 50),
  });
}
export async function POST(request: Request) {
  const auth = await withPermission("assignments.create");
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const validated = teacherAssignmentCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  const created = await createTeacherAssignment(db, user.id, {
    title: d.title,
    description: d.description ?? null,
    subject: d.subject,
    classGrade: d.classGrade,
    instructions: d.instructions ?? null,
    status: d.status,
    dueDate: d.dueDate ? new Date(d.dueDate) : null,
    publishAt: d.publishAt ? new Date(d.publishAt) : null,
    attachmentUrl: d.attachmentUrl ?? null,
    attachmentName: d.attachmentName ?? null,
    maxMarks: d.maxMarks ?? null,
  });
  if (!created.ok) {
    return jsonError(400, "Invalid assignment data");
  }
  await logAudit(db, {
    actorId: user.id,
    action: "assignment.create",
    targetType: "class_assignment",
    targetId: created.assignmentId.toHexString(),
    details: { classGrade: d.classGrade, status: d.status },
  });
  // Publishing immediately notifies the real roster once per student.
  let notified = 0;
  if (d.status === "published") {
    const students = await col<UserDoc>(db, "users")
      .find({ role: "student", classGrade: d.classGrade } as never)
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
        message: d.title,
        data: { assignment_id: created.assignmentId.toHexString(), due_date: d.dueDate ?? null },
        dedupeKey: `assignment:${created.assignmentId.toHexString()}:${sid.toHexString()}`,
      });
      if (inserted) notified += 1;
    }
  }
  return NextResponse.json(
    {
      assignment: { id: created.assignmentId.toHexString() },
      notified,
    },
    { status: 201 }
  );
}