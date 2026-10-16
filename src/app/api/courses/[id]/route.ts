import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { courseUpdateSchema } from "@/lib/validation";
import {
  courseCounts,
  deleteCourse,
  getCourse,
  listAssignments,
  listExams,
  listNotes,
  listTasks,
  updateCourse,
} from "@/lib/db/academic";
import {
  toAssignmentJSON,
  toCourseJSON,
  toExamJSON,
  toNoteJSON,
  toTaskJSON,
} from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

interface Params { params: Promise<{ id: string }> }

async function authed(rawId: string) {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    if (!objectIdSchema.safeParse(rawId).success) {
      return { db, error: NextResponse.json({ error: "Course not found" }, { status: 404 }) };
    }
    return { db, user };
  } catch (err) {
    const { status, message } = toHttpError(err);
    return { db, error: NextResponse.json({ error: message }, { status }) };
  }
}

/** Course detail aggregates the owner's linked work (all owner-scoped). */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const row = await getCourse(db, user.id, id);
  if (!row) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  const [counts, tasks, assignments, exams, notes] = await Promise.all([
    courseCounts(db, user.id, id),
    listTasks(db, user.id, { view: "all", courseId: id, limit: 20 }),
    listAssignments(db, user.id, { status: "open", courseId: id, limit: 20 }),
    listExams(db, user.id, { view: "upcoming", courseId: id, limit: 10 }),
    listNotes(db, user.id, { courseId: id, limit: 10 }),
  ]);
  const rec = row as unknown as Record<string, unknown>;
  return NextResponse.json({
    course: toCourseJSON({ ...rec, counts }),
    tasks: tasks.map((t) => toTaskJSON(t as unknown as Record<string, unknown>)),
    assignments: assignments.map((a) => toAssignmentJSON(a as unknown as Record<string, unknown>)),
    exams: exams.map((e) => toExamJSON(e as unknown as Record<string, unknown>)),
    notes: notes.map((n) => toNoteJSON(n as unknown as Record<string, unknown>)),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const validated = courseUpdateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const res = await updateCourse(db, user.id, id, { ...validated.data });
  if (!res.ok) {
    if (res.reason === "bad_name") return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  const row = await getCourse(db, user.id, id);
  return NextResponse.json({ course: row ? toCourseJSON(row as unknown as Record<string, unknown>) : { id } });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const res = await deleteCourse(ctx.db, ctx.user.id, id);
  if (!res.ok) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
