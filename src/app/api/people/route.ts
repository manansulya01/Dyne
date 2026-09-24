import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type UserDoc } from "@/lib/mongo/collections";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";

const VALID_ROLES = ["student", "teacher", "staff", "club", "admin"];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 100);
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
  const search = searchParams.get("search")?.trim() || "";
  const role = searchParams.get("role") || "";
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);

  const filter: Record<string, unknown> = {};
  if (search) {
    const rx = { $regex: escapeRegExp(search), $options: "i" };
    filter.$or = [{ username: rx }, { displayName: rx }];
  }
  if (role && VALID_ROLES.includes(role)) filter.role = role;
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) filter.createdAt = { $lt: parsed };
  }

  const rows = await col<UserDoc>(db, "users")
    .find(filter as never)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  const ids = rows.map((r) => r._id);
  const [followerCounts, followingCounts, myFollows] = await Promise.all([
    col(db, "follows")
      .aggregate([
        { $match: { followingId: { $in: ids } } },
        { $group: { _id: "$followingId", n: { $sum: 1 } } },
      ])
      .toArray(),
    col(db, "follows")
      .aggregate([
        { $match: { followerId: { $in: ids } } },
        { $group: { _id: "$followerId", n: { $sum: 1 } } },
      ])
      .toArray(),
    col(db, "follows")
      .find({ followerId: new ObjectId(user.id), followingId: { $in: ids } } as never)
      .project({ followingId: 1 })
      .toArray(),
  ]);
  const followersMap = new Map(followerCounts.map((r) => [String(r._id), r.n as number]));
  const followingMap = new Map(followingCounts.map((r) => [String(r._id), r.n as number]));
  const followingSet = new Set(myFollows.map((r) => String(r.followingId)));

  const profiles = rows.map((p) => ({
    id: p._id.toHexString(),
    username: p.username,
    display_name: p.displayName,
    avatar_url: p.avatarUrl,
    bio: p.bio,
    role: p.role,
    class_grade: p.classGrade,
    house: p.house,
    interests: p.interests,
    created_at: p.createdAt,
    followers_count: followersMap.get(p._id.toHexString()) ?? 0,
    following_count: followingMap.get(p._id.toHexString()) ?? 0,
    is_following: followingSet.has(p._id.toHexString()),
  }));

  return NextResponse.json({
    profiles,
    cursor: rows.length ? rows[rows.length - 1].createdAt : null,
    hasMore: rows.length === limit,
  });
}
