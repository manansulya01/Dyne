import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { goalCreateSchema, GOAL_STATUSES } from "@/lib/validation";
import { createGoal, getGoal, listGoals } from "@/lib/db/productivity";
import { toGoalJSON } from "@/lib/db/contracts";
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
  const rawStatus = searchParams.get("status");
  const status = rawStatus === "open" ? "open" as const
    : rawStatus && (GOAL_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as typeof GOAL_STATUSES[number]) : undefined;
  const rows = await listGoals(db, user.id, {
    status,
    limit: parseLimitParam(searchParams.get("limit"), 50, 100),
  });
  return NextResponse.json({
    goals: rows.map((g) => toGoalJSON(g as unknown as Record<string, unknown>)),
  });
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const rl = rateLimit(`goals:${clientKey(request, user.id)}`, 120, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const validated = goalCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  const created = await createGoal(db, user.id, {
    title: d.title,
    description: d.description,
    target: d.target,
    current: d.current,
    unit: d.unit,
    deadline: d.deadline ? new Date(d.deadline) : null,
    status: d.status,
  });
  const row = await getGoal(db, user.id, created.goalId);
  return NextResponse.json(
    { goal: row ? toGoalJSON(row as unknown as Record<string, unknown>) : { id: created.goalId.toHexString() } },
    { status: 201 }
  );
}
