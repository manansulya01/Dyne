import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type CommunityDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { listCommunityPosts, memberRole } from "@/lib/db/communities";
import { toCommunityPostJSON } from "@/lib/db/contracts";
import { parseLimitParam } from "@/lib/utils";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb();
  await ensureIndexes(db);

  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);

  const membership = await memberRole(db, id, user.id);
  if (!membership && user.role !== "admin") {
    const community = await col<CommunityDoc>(db, "communities").findOne({
      _id: toObjectId(id),
    } as never);
    if (!community) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }
    if (community.isPrivate && !community.ownerId.equals(toObjectId(user.id))) {
      return NextResponse.json({ error: "This community is private" }, { status: 403 });
    }
  }

  let before: Date | undefined;
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) before = parsed;
  }
  const posts = await listCommunityPosts(db, id, limit, before);
  const mapped = posts.map((p) => toCommunityPostJSON(p as unknown as Record<string, unknown>));

  return NextResponse.json({
    posts: mapped,
    cursor: mapped.length ? mapped[mapped.length - 1].created_at : null,
    hasMore: mapped.length === limit,
  });
}
