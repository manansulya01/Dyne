import { NextResponse } from "next/server";
import { objectIdSchema } from "@/lib/mongo/ids";
import { classExamCreateSchema } from "@/lib/validation";
import { createExam, listExams } from "@/lib/db/classExams";
import { assignableClassGrades } from "@/lib/db/teacherAssignments";
import { toClassExamJSON } from "@/lib/db/contracts";
import { logAudit } from "@/lib/security/audit";
import { guardRate, jsonError, withPermission, withUser } from "@/lib/security/authorize";
import { hasPermission } from "@/lib/permissions";
import { parseLimitParam } from "@/lib/utils";
/**
 * Class exams.
 *
 * GET  — teacher sees their own; admins may list all. Students never get the
 *        full exam list here (they get published exams from their class via
 *        the student-facing route).
 * POST — create (teacher/admin).
 */
export async function GET(request: Request) {
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const isAdmin = user.role === "admin" || user.role === "super_admin";
  if (!isAdmin && !hasPermission(user.role, "exams.create")) {
    return jsonError(403, "Forbidden");
  }
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const status =
    statusParam === "draft" || statusParam === "published" || statusParam === "closed" || statusParam === "archived"
      ? statusParam
      : undefined;
  const beforeCreatedAt = searchParams.get("before");
  const beforeId = searchParams.get("beforeId");
  let before: { createdAt: Date; id: string } | null = null;
  if (beforeCreatedAt) {
    const d = new Date(beforeCreatedAt);
    if (!isNaN(+d) && (!beforeId || objectIdSchema.safeParse(beforeId).success)) {
      before = { createdAt: d, id: beforeId ?? "" };
    }
  }
  const limit = parseLimitParam(searchParams.get("limit"), 25, 50);
  const rows = await listExams(db, {
    createdBy: isAdmin && searchParams.get("all") === "true" ? undefined : user.id,
    classGrade: searchParams.get("classGrade") || undefined,
    status,
    limit,
    before,
  });
  return NextResponse.json({
    exams: rows.map((r) => toClassExamJSON(r as unknown as Record<string, unknown>)),
    classes: await assignableClassGrades(db, user),
    hasMore: rows.length === limit,
  });
}
export async function POST(request: Request) {
  const auth = await withPermission("exams.create");
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const validated = classExamCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  const created = await createExam(db, user.id, {
    title: d.title,
    description: d.description ?? null,
    subject: d.subject,
    classGrade: d.classGrade,
    mode: d.mode,
    status: d.status,
    instructions: d.instructions ?? null,
    durationMinutes: d.durationMinutes ?? null,
    startsAt: new Date(d.startsAt),
    endsAt: d.endsAt ? new Date(d.endsAt) : null,
    totalMarks: d.totalMarks,
    passingMarks: d.passingMarks,
    attemptLimit: d.attemptLimit,
  });
  if (!created.ok) {
    return jsonError(
      400,
      created.reason === "bad_marks"
        ? "Passing marks cannot exceed total marks"
        : "End time must be after the start time"
    );
  }
  await logAudit(db, {
    actorId: user.id,
    action: "exam.create",
    targetType: "class_exam",
    targetId: created.examId.toHexString(),
    details: { classGrade: d.classGrade, mode: d.mode, status: d.status },
  });
  return NextResponse.json({ exam: { id: created.examId.toHexString() } }, { status: 201 });
}