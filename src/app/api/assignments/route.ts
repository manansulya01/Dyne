import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { assignmentCreateSchema, ASSIGNMENT_STATUSES } from "@/lib/validation";
import { createAssignment, getAssignment, listAssignments } from "@/lib/db/academic";
import { toAssignmentJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import { rateLimit, clientKey } from "@/lib/security/rateLimit";

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
  const rawStatus = searchParams.get("status");
  const status = rawStatus === "open" ? "open" as const
    : rawStatus && (ASSIGNMENT_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as typeof ASSIGNMENT_STATUSES[number]) : undefined;
  const courseId = searchParams.get("courseId");
  if (courseId && !objectIdSchema.safeParse(courseId).success) {
    return NextResponse.json({ error: "Invalid course id" }, { status: 400 });
  }
  const rows = await listAssignments(db, user.id, {
    status,
    courseId: courseId ?? undefined,
    search: searchParams.get("search")?.slice(0, 100) ?? undefined,
    from: parseDate(searchParams.get("from")),
    to: parseDate(searchParams.get("to")),
    limit: parseLimitParam(searchParams.get("limit"), 50, 100),
  });
  return NextResponse.json({
    assignments: rows.map((a) => toAssignmentJSON(a as unknown as Record<string, unknown>)),
  });
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const rl = rateLimit(`assignments:${clientKey(request, user.id)}`, 120, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const validated = assignmentCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  let created;
  try {
    created = await createAssignment(db, user.id, {
      title: d.title,
      description: d.description,
      courseId: d.courseId,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      priority: d.priority,
      status: d.status,
      progress: d.progress,
    });
  } catch {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  const row = await getAssignment(db, user.id, created.assignmentId);
  return NextResponse.json(
    { assignment: row ? toAssignmentJSON(row as unknown as Record<string, unknown>) : { id: created.assignmentId.toHexString() } },
    { status: 201 }
  );
}
