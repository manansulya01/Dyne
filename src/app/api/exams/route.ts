import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { examCreateSchema } from "@/lib/validation";
import { createExam, getExam, listExams, nextExam } from "@/lib/db/academic";
import { toExamJSON } from "@/lib/db/contracts";
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
  const rawView = searchParams.get("view");
  const view = rawView === "upcoming" || rawView === "past" ? rawView : "all";
  const courseId = searchParams.get("courseId");
  if (courseId && !objectIdSchema.safeParse(courseId).success) {
    return NextResponse.json({ error: "Invalid course id" }, { status: 400 });
  }
  const rows = await listExams(db, user.id, {
    view,
    courseId: courseId ?? undefined,
    from: parseDate(searchParams.get("from")),
    to: parseDate(searchParams.get("to")),
    limit: parseLimitParam(searchParams.get("limit"), 50, 100),
  });
  const out: Record<string, unknown> = {
    exams: rows.map((e) => toExamJSON(e as unknown as Record<string, unknown>)),
  };
  if (searchParams.get("next") === "1") {
    const nx = await nextExam(db, user.id);
    out.next = nx ? toExamJSON(nx as unknown as Record<string, unknown>) : null;
  }
  return NextResponse.json(out);
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const rl = rateLimit(`exams:${clientKey(request, user.id)}`, 120, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const validated = examCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  let created;
  try {
    created = await createExam(db, user.id, {
      title: d.title,
      courseId: d.courseId,
      date: new Date(d.date),
      endTime: d.endTime ? new Date(d.endTime) : null,
      location: d.location,
      topics: d.topics,
      preparation: d.preparation,
      notes: d.notes,
      status: d.status,
    });
  } catch {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  const row = await getExam(db, user.id, created.examId);
  return NextResponse.json(
    { exam: row ? toExamJSON(row as unknown as Record<string, unknown>) : { id: created.examId.toHexString() } },
    { status: 201 }
  );
}
