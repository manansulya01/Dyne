import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { studySessionUpdateSchema } from "@/lib/validation";
import { getStudySession, transitionStudySession } from "@/lib/db/productivity";
import { toStudySessionJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

interface Params { params: Promise<{ id: string }> }

async function authed(rawId: string) {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    if (!objectIdSchema.safeParse(rawId).success) {
      return { db, error: NextResponse.json({ error: "Session not found" }, { status: 404 }) };
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
  const row = await getStudySession(ctx.db, ctx.user.id, id);
  if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json({ session: toStudySessionJSON(row as unknown as Record<string, unknown>) });
}

/** pause | resume | finish | cancel (+ optional course/subject/note edits). */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const validated = studySessionUpdateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  const res = await transitionStudySession(db, user.id, id, d.action, {
    courseId: d.courseId,
    subject: d.subject,
    note: d.note,
  });
  if (!res.ok) {
    if (res.reason === "bad_course") return NextResponse.json({ error: "Course not found" }, { status: 404 });
    if (res.reason === "bad_transition") {
      return NextResponse.json({ error: "That action is not available for this session" }, { status: 409 });
    }
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const row = await getStudySession(db, user.id, id);
  return NextResponse.json({ session: row ? toStudySessionJSON(row as unknown as Record<string, unknown>) : { id } });
}
