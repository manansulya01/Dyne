import { NextResponse } from "next/server";
import { col, type UserDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { assignmentSubmissionSchema } from "@/lib/validation";
import { getTeacherAssignment, getSubmission, submitAssignment } from "@/lib/db/teacherAssignments";
import { toSubmissionJSON } from "@/lib/db/contracts";
import { guardRate, jsonError, withUser } from "@/lib/security/authorize";
interface Params {
  params: Promise<{ id: string }>;
}
/**
 * Student submission for one assignment.
 *
 * The student is always taken from the session — never from the request body —
 * so a student cannot submit work as somebody else. The upsert key
 * (assignmentId, studentId) makes rapid retries converge on one row.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Assignment not found");
  const assignment = await getTeacherAssignment(db, id);
  if (!assignment) return jsonError(404, "Assignment not found");
  const raw = assignment as unknown as Record<string, unknown>;
  if (String(raw.status ?? "draft") === "draft") return jsonError(404, "Assignment not found");
  const isOwnerTeacher = String((raw.createdBy as { toHexString(): string })?.toHexString?.() ?? "") === user.id;
  const isModerator =
    user.role === "admin" ||
    user.role === "super_admin" ||
    user.role === "teacher" ||
    user.role === "moderator" ||
    user.role === "staff";
  if (!isOwnerTeacher && !isModerator && user.role !== "student") {
    return jsonError(403, "Forbidden");
  }
  if (user.role === "student") {
    const me = await col<UserDoc>(db, "users").findOne({ _id: toObjectId(user.id) } as never, {
      projection: { classGrade: 1 },
    });
    if (!me?.classGrade || me.classGrade !== String(raw.classGrade ?? "")) {
      return jsonError(403, "Forbidden");
    }
  }
  const submission = await getSubmission(db, id, user.id);
  return NextResponse.json({
    // A student only ever reads their own submission.
    submission: submission ? toSubmissionJSON(submission as unknown as Record<string, unknown>) : null,
  });
}
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Assignment not found");
  const assignment = await getTeacherAssignment(db, id);
  if (!assignment) return jsonError(404, "Assignment not found");
  const raw = assignment as unknown as Record<string, unknown>;
  if (String(raw.status ?? "draft") === "draft") return jsonError(404, "Assignment not found");
  if (user.role !== "student") return jsonError(403, "Only students submit assignments");
  const me = await col<UserDoc>(db, "users").findOne({ _id: toObjectId(user.id) } as never, {
    projection: { classGrade: 1 },
  });
  if (!me?.classGrade || me.classGrade !== String(raw.classGrade ?? "")) {
    return jsonError(403, "You are not in this assignment's class");
  }
  const body = await request.json().catch(() => null);
  const validated = assignmentSubmissionSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  const result = await submitAssignment(db, {
    assignmentId: id,
    // Session-derived identity only.
    studentId: user.id,
    status: d.status,
    progress: d.progress,
    submissionUrl: d.submissionUrl ?? null,
    submissionName: d.submissionName ?? null,
    submissionText: d.submissionText ?? null,
  });
  if (!result.ok) {
    if (result.reason === "closed") return jsonError(409, "This assignment is closed");
    if (result.reason === "bad_url") return jsonError(400, "Invalid attachment URL");
    return jsonError(404, "Assignment not found");
  }
  return NextResponse.json({
    submission: toSubmissionJSON(result.submission as unknown as Record<string, unknown>),
  });
}