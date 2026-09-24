import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { pollCreateSchema } from "@/lib/validation";
import { createPoll, listPolls } from "@/lib/db/polls";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try { user = await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  const { searchParams } = new URL(request.url);
  const communityId = searchParams.get("communityId");
  if (!communityId) return NextResponse.json({ error: "communityId required" }, { status: 400 });
  const polls = await listPolls(db, communityId, parseLimitParam(searchParams.get("limit"), 20, 50), user.id);
  return NextResponse.json({ polls });
}

export async function POST(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try { user = await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  const body = await request.json().catch(() => null);
  const validated = pollCreateSchema.safeParse(body);
  if (!validated.success) return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  const created = await createPoll(db, user.id, validated.data);
  if (!created.ok) return NextResponse.json({ error: "Join this community to create polls" }, { status: 403 });
  return NextResponse.json({ id: created.pollId.toHexString() }, { status: 201 });
}
