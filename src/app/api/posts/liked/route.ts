import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type ReactionDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { getPostsByIds } from "@/lib/db/posts";
import { toPostJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";

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
  const userId = searchParams.get("userId") || user.id;
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);

  // Users can only see their own liked posts (reactions are private by user).
  if (!objectIdSchema.safeParse(userId).success) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }
  if (userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filter: Record<string, unknown> = {
    userId: toObjectId(user.id),
    targetType: "post",
  };
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) filter.createdAt = { $lt: parsed };
  }

  const reactions = await col<ReactionDoc>(db, "reactions")
    .find(filter as never)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  if (reactions.length === 0) {
    return NextResponse.json({ posts: [] });
  }

  const posts = await getPostsByIds(
    db,
    reactions.map((r) => r.targetId)
  );

  return NextResponse.json({
    posts: posts.map((p) => toPostJSON(p as unknown as Record<string, unknown>)),
    cursor: reactions[reactions.length - 1]?.createdAt ?? null,
    hasMore: reactions.length === limit,
  });
}
