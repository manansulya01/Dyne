import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { goalUpdateSchema } from "@/lib/validation";
import { deleteGoal, getGoal, updateGoal } from "@/lib/db/productivity";
import { toGoalJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

interface Params { params: Promise<{ id: string }> }

async function authed(rawId: string) {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    if (!objectIdSchema.safeParse(rawId).success) {
      return { db, error: NextResponse.json({ error: "Goal not found" }, { status: 404 }) };
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
  const row = await getGoal(ctx.db, ctx.user.id, id);
  if (!row) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  return NextResponse.json({ goal: toGoalJSON(row as unknown as Record<string, unknown>) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const validated = goalUpdateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  const res = await updateGoal(db, user.id, id, {
    title: d.title,
    description: d.description,
    target: d.target,
    current: d.current,
    unit: d.unit,
    deadline: d.deadline === undefined ? undefined : d.deadline ? new Date(d.deadline) : null,
    status: d.status,
  });
  if (!res.ok) {
    if (res.reason === "bad_title") return NextResponse.json({ error: "Title is required" }, { status: 400 });
    if (res.reason === "bad_target" || res.reason === "bad_current") {
      return NextResponse.json({ error: "Progress values must be valid numbers" }, { status: 400 });
    }
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }
  const row = await getGoal(db, user.id, id);
  return NextResponse.json({ goal: row ? toGoalJSON(row as unknown as Record<string, unknown>) : { id } });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const res = await deleteGoal(ctx.db, ctx.user.id, id);
  if (!res.ok) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
