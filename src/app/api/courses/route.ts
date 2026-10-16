import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { courseCreateSchema } from "@/lib/validation";
import { courseCounts, createCourse, getCourse, listCourses } from "@/lib/db/academic";
import { toCourseJSON } from "@/lib/db/contracts";
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

export async function GET(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const withCounts = searchParams.get("counts") === "1";
  const rows = await listCourses(db, user.id, parseLimitParam(searchParams.get("limit"), 50, 100));
  const out = [];
  for (const r of rows) {
    const rec = r as unknown as Record<string, unknown>;
    const counts = withCounts
      ? await courseCounts(db, user.id, String(rec.id ?? (rec as { _id?: unknown })._id))
      : null;
    out.push(toCourseJSON({ ...rec, counts }));
  }
  return NextResponse.json({ courses: out });
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const rl = rateLimit(`courses:${clientKey(request, user.id)}`, 60, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const validated = courseCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  const created = await createCourse(db, user.id, {
    name: d.name,
    code: d.code,
    instructor: d.instructor,
    color: d.color,
    room: d.room,
    description: d.description,
    semester: d.semester,
    schedule: d.schedule,
  });
  const row = await getCourse(db, user.id, created.courseId);
  return NextResponse.json(
    { course: row ? toCourseJSON(row as unknown as Record<string, unknown>) : { id: created.courseId.toHexString() } },
    { status: 201 }
  );
}
