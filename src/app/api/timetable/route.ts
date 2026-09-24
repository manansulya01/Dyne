import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { timetableEntrySchema } from "@/lib/validation";
import { clearTimetable, listTimetable, upsertTimetableEntry } from "@/lib/db/content";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

const CAN_EDIT = new Set(["admin", "teacher", "staff"]);

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  try { await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  const { searchParams } = new URL(request.url);
  const entries = await listTimetable(db, searchParams.get("classGrade") ?? undefined);
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try { user = await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!CAN_EDIT.has(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const validated = timetableEntrySchema.safeParse(body);
  if (!validated.success) return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  if (validated.data.endTime <= validated.data.startTime) {
    return NextResponse.json({ error: { endTime: ["End time must be after start time"] } }, { status: 400 });
  }
  const res = await upsertTimetableEntry(db, user.id, validated.data);
  return NextResponse.json({ success: true, ...res }, { status: 201 });
}

export async function DELETE(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try { user = await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!CAN_EDIT.has(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  await clearTimetable(db, searchParams.get("classGrade") ?? undefined);
  return NextResponse.json({ success: true });
}
