import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { votePoll } from "@/lib/db/polls";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { z } from "zod";

interface Params { params: Promise<{ id: string }>; }

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try { user = await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!objectIdSchema.safeParse(id).success) return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = z.object({ optionIndex: z.number().int().min(0).max(5) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "optionIndex required" }, { status: 400 });
  const res = await votePoll(db, id, user.id, parsed.data.optionIndex);
  if (!res.ok) {
    const status = res.reason === "forbidden" ? 403 : res.reason === "not_found" ? 404 : 400;
    return NextResponse.json({ error: res.reason }, { status });
  }
  return NextResponse.json({ success: true });
}
