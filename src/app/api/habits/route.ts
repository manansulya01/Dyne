import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { habitCreateSchema } from "@/lib/validation";
import { createHabit, getHabit, listHabits } from "@/lib/db/productivity";
import { toHabitJSON } from "@/lib/db/contracts";
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
  const activeParam = searchParams.get("active");
  const rows = await listHabits(db, user.id, {
    activeOnly: activeParam === "1" ? true : undefined,
    limit: parseLimitParam(searchParams.get("limit"), 50, 100),
  });
  return NextResponse.json({
    habits: rows.map((h) => toHabitJSON(h as unknown as Record<string, unknown>)),
  });
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const rl = rateLimit(`habits:${clientKey(request, user.id)}`, 120, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const validated = habitCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const created = await createHabit(db, user.id, { ...validated.data });
  const row = await getHabit(db, user.id, created.habitId);
  return NextResponse.json(
    { habit: row ? toHabitJSON(row as unknown as Record<string, unknown>) : { id: created.habitId.toHexString() } },
    { status: 201 }
  );
}
