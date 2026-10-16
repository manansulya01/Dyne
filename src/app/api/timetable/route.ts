import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { timetableEntrySchema } from "@/lib/validation";
import { clearTimetable, listTimetable, upsertTimetableEntry } from "@/lib/db/content";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { logAudit } from "@/lib/security/audit";

const CAN_EDIT = new Set(["admin", "super_admin", "teacher", "staff"]);

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
  const classGrade = searchParams.get("classGrade")?.trim() || null;
  // Require an explicit class scope: an unscoped clear would wipe the entire
  // timetable for every class. This is destructive-by-design protection.
  if (!classGrade) {
    return NextResponse.json({ error: "classGrade is required to clear a timetable" }, { status: 400 });
  }
  const rawDay = searchParams.get("dayOfWeek");
  let dayOfWeek: number | undefined;
  if (rawDay !== null && rawDay !== "") {
    const parsed = Number(rawDay);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) {
      return NextResponse.json({ error: "dayOfWeek must be 0–6" }, { status: 400 });
    }
    dayOfWeek = parsed;
  }
  await clearTimetable(db, classGrade, dayOfWeek);
  await logAudit(db, {
    actorId: user.id,
    action: "timetable.clear",
    targetType: "timetable",
    details: { classGrade, ...(dayOfWeek !== undefined ? { dayOfWeek } : {}) },
  });
  return NextResponse.json({ success: true });
}
