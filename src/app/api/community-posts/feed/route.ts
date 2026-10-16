import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { listCommunityFeed } from "@/lib/db/communities";
import { toCommunityPostJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";

/** Authenticated member's cross-community discussion feed (latest first). */
export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  const { searchParams } = new URL(request.url);
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);
  const cursor = searchParams.get("cursor");
  let before: Date | undefined;
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) before = parsed;
  }
  const rows = await listCommunityFeed(db, user.id, limit, before);
  const posts = rows.map((r) => {
    const json = toCommunityPostJSON(r as unknown as Record<string, unknown>);
    const community = (r as unknown as Record<string, unknown>).community ?? null;
    return { ...json, community };
  });
  return NextResponse.json({ posts });
}
