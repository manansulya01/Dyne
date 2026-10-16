import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { habitLogSchema, habitUpdateSchema } from "@/lib/validation";
import { deleteHabit, getHabit, habitHistory, logHabitDay, updateHabit } from "@/lib/db/productivity";
import { toHabitJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";

interface Params { params: Promise<{ id: string }> }

async function authed(rawId: string) {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    if (!objectIdSchema.safeParse(rawId).success) {
      return { db, error: NextResponse.json({ error: "Habit not found" }, { status: 404 }) };
    }
    return { db, user };
  } catch (err) {
    const { status, message } = toHttpError(err);
    return { db, error: NextResponse.json({ error: message }, { status }) };
  }
}

const mapHabit = (row: unknown) => toHabitJSON(row as unknown as Record<string, unknown>);

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  // ?history=1 returns the completion log instead of the habit.
  const { searchParams } = new URL(request.url);
  if (searchParams.get("history") === "1") {
    const hist = await habitHistory(db, user.id, id, parseLimitParam(searchParams.get("limit"), 30, 365));
    if (!hist.ok) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    return NextResponse.json({ logs: hist.logs });
  }
  const row = await getHabit(db, user.id, id);
  if (!row) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  return NextResponse.json({ habit: mapHabit(row) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  // Log action: { log: { date, count } } — validated separately.
  if (body && typeof body === "object" && "log" in (body as Record<string, unknown>)) {
    const validated = habitLogSchema.safeParse((body as { log: unknown }).log);
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
    }
    const res = await logHabitDay(db, user.id, id, validated.data.date, validated.data.count);
    if (!res.ok) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    const row = await getHabit(db, user.id, id);
    return NextResponse.json({ habit: row ? mapHabit(row) : { id } });
  }

  const validated = habitUpdateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const res = await updateHabit(db, user.id, id, { ...validated.data });
  if (!res.ok) {
    if (res.reason === "bad_name") return NextResponse.json({ error: "Name is required" }, { status: 400 });
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }
  const row = await getHabit(db, user.id, id);
  return NextResponse.json({ habit: row ? mapHabit(row) : { id } });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const res = await deleteHabit(ctx.db, ctx.user.id, id);
  if (!res.ok) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
