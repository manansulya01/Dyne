import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { taskCreateSchema, TASK_PRIORITIES } from "@/lib/validation";
import { createTask, listTasks, type TaskView } from "@/lib/db/academic";
import { toTaskJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import { rateLimit, clientKey } from "@/lib/security/rateLimit";

const VIEWS: TaskView[] = ["today", "upcoming", "completed", "all", "overdue"];

async function authed() {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    return { db, user };
  } catch (err) {
    const { status, message } = toHttpError(err);
    return { db, error: NextResponse.json({ error: message }, { status }) };
  }
}

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return isNaN(+d) ? undefined : d;
}

export async function GET(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const rawView = searchParams.get("view");
  const view: TaskView = rawView && (VIEWS as string[]).includes(rawView) ? (rawView as TaskView) : "all";
  const courseId = searchParams.get("courseId");
  if (courseId && !objectIdSchema.safeParse(courseId).success) {
    return NextResponse.json({ error: "Invalid course id" }, { status: 400 });
  }
  const rawPriority = searchParams.get("priority");
  const priority = rawPriority && (TASK_PRIORITIES as readonly string[]).includes(rawPriority)
    ? (rawPriority as typeof TASK_PRIORITIES[number])
    : undefined;
  const limit = parseLimitParam(searchParams.get("limit"), 50, 100);

  const rows = await listTasks(db, user.id, {
    view,
    courseId: courseId ?? undefined,
    priority,
    search: searchParams.get("search")?.slice(0, 100) ?? undefined,
    from: parseDate(searchParams.get("from")),
    to: parseDate(searchParams.get("to")),
    limit,
  });
  return NextResponse.json({
    tasks: rows.map((t) => toTaskJSON(t as unknown as Record<string, unknown>)),
  });
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const rl = rateLimit(`tasks:${clientKey(request, user.id)}`, 120, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const validated = taskCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  let created;
  try {
    created = await createTask(db, user.id, {
      title: d.title,
      description: d.description,
      priority: d.priority,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      courseId: d.courseId,
      tags: d.tags,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ error: "Course not found" }, { status: status === 404 ? 404 : 400 });
  }
  const { getTask } = await import("@/lib/db/academic");
  const row = await getTask(db, user.id, created.taskId);
  return NextResponse.json(
    { task: row ? toTaskJSON(row as unknown as Record<string, unknown>) : { id: created.taskId.toHexString() } },
    { status: 201 }
  );
}
