import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { noteCreateSchema } from "@/lib/validation";
import { createNote, getNote, listNotes } from "@/lib/db/academic";
import { toNoteJSON } from "@/lib/db/contracts";
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
  const courseId = searchParams.get("courseId");
  if (courseId && !objectIdSchema.safeParse(courseId).success) {
    return NextResponse.json({ error: "Invalid course id" }, { status: 400 });
  }
  const rows = await listNotes(db, user.id, {
    search: searchParams.get("search")?.slice(0, 100) ?? undefined,
    courseId: courseId ?? undefined,
    tag: searchParams.get("tag")?.slice(0, 30) ?? undefined,
    limit: parseLimitParam(searchParams.get("limit"), 50, 100),
  });
  return NextResponse.json({
    notes: rows.map((n) => toNoteJSON(n as unknown as Record<string, unknown>)),
  });
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const rl = rateLimit(`notes:${clientKey(request, user.id)}`, 120, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const validated = noteCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  let created;
  try {
    created = await createNote(db, user.id, {
      title: d.title,
      body: d.body,
      courseId: d.courseId,
      tags: d.tags,
    });
  } catch {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  const row = await getNote(db, user.id, created.noteId);
  return NextResponse.json(
    { note: row ? toNoteJSON(row as unknown as Record<string, unknown>) : { id: created.noteId.toHexString() } },
    { status: 201 }
  );
}
