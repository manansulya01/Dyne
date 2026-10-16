import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { noteUpdateSchema } from "@/lib/validation";
import { deleteNote, getNote, updateNote } from "@/lib/db/academic";
import { toNoteJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

interface Params { params: Promise<{ id: string }> }

async function authed(rawId: string) {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    if (!objectIdSchema.safeParse(rawId).success) {
      return { db, error: NextResponse.json({ error: "Note not found" }, { status: 404 }) };
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
  const row = await getNote(ctx.db, ctx.user.id, id);
  if (!row) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  return NextResponse.json({ note: toNoteJSON(row as unknown as Record<string, unknown>) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const validated = noteUpdateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const res = await updateNote(db, user.id, id, { ...validated.data });
  if (!res.ok) {
    if (res.reason === "bad_course") return NextResponse.json({ error: "Course not found" }, { status: 404 });
    if (res.reason === "bad_title") return NextResponse.json({ error: "Title is required" }, { status: 400 });
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  const row = await getNote(db, user.id, id);
  return NextResponse.json({ note: row ? toNoteJSON(row as unknown as Record<string, unknown>) : { id } });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const res = await deleteNote(ctx.db, ctx.user.id, id);
  if (!res.ok) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
