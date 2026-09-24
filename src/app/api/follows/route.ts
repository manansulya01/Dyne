import { NextResponse } from "next/server";
import { z } from "zod";
import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { followUser, unfollowUser } from "@/lib/db/users";
import { resolveAuthors } from "@/lib/db/authors";
import { createNotification } from "@/lib/db/notifications";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";

const targetSchema = z.object({ targetUserId: objectIdSchema });

export async function POST(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const body = await request.json().catch(() => null);
  const validated = targetSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: "Target user ID required" }, { status: 400 });
  }

  const result = await followUser(db, user.id, validated.data.targetUserId);
  if (!result.ok) {
    if (result.reason === "self") {
      return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
    }
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Already following" }, { status: 400 });
  }

  await createNotification(db, {
    recipientId: validated.data.targetUserId,
    actorId: user.id,
    type: "follow",
    title: "New follower",
    message: "started following you",
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
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
  let targetUserId = searchParams.get("targetUserId");

  // Accept JSON body as well (client sends body for unfollow).
  if (!targetUserId) {
    try {
      const body = await request.json();
      targetUserId = body?.targetUserId ?? null;
    } catch {
      // no body — fall through to 400 below
    }
  }

  if (!targetUserId || !objectIdSchema.safeParse(targetUserId).success) {
    return NextResponse.json({ error: "Target user ID required" }, { status: 400 });
  }

  await unfollowUser(db, user.id, targetUserId);
  return NextResponse.json({ success: true });
}

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
  const rawId = searchParams.get("userId") || user.id;
  if (!objectIdSchema.safeParse(rawId).success) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const type = searchParams.get("type") || "followers";
  if (type !== "followers" && type !== "following") {
    return NextResponse.json({ error: "Invalid type (followers|following)" }, { status: 400 });
  }
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);

  const field = type === "followers" ? "followingId" : "followerId";
  const query: Record<string, unknown> = { [field]: toObjectId(rawId) };
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) query.createdAt = { $lt: parsed };
  }

  const rows = await col(db, "follows")
    .find(query as never)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  const otherField = type === "followers" ? "followerId" : "followingId";
  const authors = await resolveAuthors(
    db,
    rows.map((r) => r[otherField] as ObjectId)
  );
  const profiles = rows
    .map((r) => authors.get((r[otherField] as ObjectId).toHexString()) ?? null)
    .filter(Boolean);

  return NextResponse.json({ profiles });
}
