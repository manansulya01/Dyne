import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { taskUpdateSchema } from "@/lib/validation";
import { completeTask, deleteTask, getTask, updateTask } from "@/lib/db/academic";
import { toTaskJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

interface Params { params: Promise<{ id: string }> }

async function authed(rawId: string) {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    if (!objectIdSchema.safeParse(rawId).success) {
      return { db, error: NextResponse.json({ error: "Task not found" }, { status: 404 }) };
    }
    return { db, user };
  } catch (err) {
    const { status, message } = toHttpError(err);
    return { db, error: NextResponse.json({ error: message }, { status }) };
  }
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const row = await getTask(ctx.db, ctx.user.id, id);
  if (!row) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ task: toTaskJSON(row as unknown as Record<string, unknown>) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  // Complete/reopen is a first-class action alongside field edits.
  if (body && typeof body === "object" && "completed" in (body as Record<string, unknown>) && Object.keys(body as object).length === 1) {
    const done = (body as { completed: unknown }).completed === true;
    const res = await completeTask(db, user.id, id, done);
    if (!res.ok) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const row = await getTask(db, user.id, id);
    return NextResponse.json({ task: row ? toTaskJSON(row as unknown as Record<string, unknown>) : { id } });
  }

  const validated = taskUpdateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  const res = await updateTask(db, user.id, id, {
    title: d.title,
    description: d.description,
    priority: d.priority,
    dueDate: d.dueDate === undefined ? undefined : d.dueDate ? new Date(d.dueDate) : null,
    courseId: d.courseId,
    tags: d.tags,
  });
  if (!res.ok) {
    if (res.reason === "bad_course") return NextResponse.json({ error: "Course not found" }, { status: 404 });
    if (res.reason === "bad_title") return NextResponse.json({ error: "Title is required" }, { status: 400 });
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const row = await getTask(db, user.id, id);
  return NextResponse.json({ task: row ? toTaskJSON(row as unknown as Record<string, unknown>) : { id } });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const res = await deleteTask(ctx.db, ctx.user.id, id);
  if (!res.ok) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
