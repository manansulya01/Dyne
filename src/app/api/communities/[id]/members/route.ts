import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type CommunityDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import {
  joinCommunity,
  leaveCommunity,
  memberRole,
} from "@/lib/db/communities";
import { resolveAuthors } from "@/lib/db/authors";
import { createNotification } from "@/lib/db/notifications";
import { toMemberJSON } from "@/lib/db/contracts";
import { parseLimitParam } from "@/lib/utils";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

interface Params {
  params: Promise<{ id: string }>;
}

async function authed(rawId: string) {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    if (!objectIdSchema.safeParse(rawId).success) {
      return { db, error: NextResponse.json({ error: "Community not found" }, { status: 404 }) };
    }
    return { db, user };
  } catch (err) {
    const { status, message } = toHttpError(err);
    return { db, error: NextResponse.json({ error: message }, { status }) };
  }
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);

  const community = await col<CommunityDoc>(db, "communities").findOne({
    _id: toObjectId(id),
  } as never);
  if (!community) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  const role = await memberRole(db, id, user.id);
  const isOwner = community.ownerId.equals(toObjectId(user.id));
  if (!role && !isOwner && user.role !== "admin" && community.isPrivate) {
    return NextResponse.json({ error: "This community is private" }, { status: 403 });
  }

  const filter: Record<string, unknown> = { communityId: toObjectId(id) };
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) filter.joinedAt = { $lt: parsed };
  }
  const rows = await col(db, "communityMembers")
    .find(filter as never)
    .sort({ joinedAt: -1 })
    .limit(limit)
    .toArray();
  const authors = await resolveAuthors(
    db,
    rows.map((r) => r.userId)
  );
  const members = rows.map((r) =>
    toMemberJSON({
      user: authors.get(r.userId.toHexString()) ?? null,
      role: r.role,
      joinedAt: r.joinedAt,
    } as unknown as Record<string, unknown>)
  );

  return NextResponse.json({
    members,
    cursor: rows.length ? rows[rows.length - 1].joinedAt : null,
    hasMore: rows.length === limit,
  });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const community = await col<CommunityDoc>(db, "communities").findOne({
    _id: toObjectId(id),
  } as never);
  if (!community) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }
  if (community.isPrivate && !community.ownerId.equals(toObjectId(user.id))) {
    return NextResponse.json({ error: "This community is private" }, { status: 403 });
  }

  const joined = await joinCommunity(db, id, user.id);
  if (!joined.ok) {
    if (joined.reason === "private") {
      return NextResponse.json({ error: "This community is private" }, { status: 403 });
    }
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }
  if ("already" in joined) {
    return NextResponse.json({ error: "Already a member" }, { status: 400 });
  }

  if (!community.ownerId.equals(toObjectId(user.id))) {
    await createNotification(db, {
      recipientId: community.ownerId,
      actorId: user.id,
      type: "community_join",
      title: "New member",
      message: "joined your community",
      data: { community_id: id },
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const rawTarget = searchParams.get("userId") || user.id;
  if (!objectIdSchema.safeParse(rawTarget).success) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const result = await leaveCommunity(db, id, rawTarget, user.id, user.role === "admin");
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }
    if (result.reason === "forbidden" || result.reason === "cannot_remove_owner") {
      const message =
        result.reason === "forbidden" ? "Forbidden" : "Cannot remove owner";
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: "Owners cannot leave their community" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
