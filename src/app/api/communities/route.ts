import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type CommunityDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { communityCreateSchema } from "@/lib/validation";
import { createCommunity } from "@/lib/db/communities";
import { resolveAuthors } from "@/lib/db/authors";
import { toCommunityJSON } from "@/lib/db/contracts";
import { parseLimitParam } from "@/lib/utils";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  const search = (searchParams.get("search") || "").trim().slice(0, 100);
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);

  const uid = toObjectId(user.id);
  const and: Record<string, unknown>[] = [];
  if (search) {
    const rx = { $regex: escapeRegExp(search), $options: "i" };
    and.push({ $or: [{ name: rx }, { description: rx }] });
  }
  // Private communities are visible only to members, the owner, and admins.
  if (user.role !== "admin") {
    const mine = await col(db, "communityMembers")
      .find({ userId: uid } as never)
      .project({ communityId: 1 })
      .toArray();
    const memberIds = mine.map((m) => m.communityId);
    and.push({ $or: [{ isPrivate: false }, { _id: { $in: memberIds } }, { ownerId: uid }] });
  }
  const filter: Record<string, unknown> = and.length ? { $and: and } : {};
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) filter.createdAt = { $lt: parsed };
  }

  const rows = await col<CommunityDoc>(db, "communities")
    .find(filter as never)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  const ids = rows.map((c) => c._id);
  const [counts, memberships, owners] = await Promise.all([
    ids.length
      ? col(db, "communityMembers")
          .aggregate([
            { $match: { communityId: { $in: ids } } },
            { $group: { _id: "$communityId", n: { $sum: 1 } } },
          ])
          .toArray()
      : Promise.resolve([]),
    ids.length
      ? col(db, "communityMembers")
          .find({ communityId: { $in: ids }, userId: toObjectId(user.id) } as never)
          .toArray()
      : Promise.resolve([]),
    resolveAuthors(
      db,
      rows.map((c) => c.ownerId)
    ),
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.n as number]));
  const roleMap = new Map(memberships.map((m) => [m.communityId.toHexString(), m.role as string]));

  const communities = rows.map((c) => {
    const role = roleMap.get(c._id.toHexString());
    return toCommunityJSON({
      ...c,
      memberCount: countMap.get(c._id.toHexString()) ?? 0,
      isMember: !!role,
      isOwner: c.ownerId.equals(toObjectId(user.id)),
      memberRole: role ?? "none",
      owner: owners.get(c.ownerId.toHexString()) ?? null,
    } as unknown as Record<string, unknown>);
  });

  return NextResponse.json({
    communities,
    cursor: rows.length ? rows[rows.length - 1].createdAt : null,
    hasMore: rows.length === limit,
  });
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const validated = communityCreateSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const created = await createCommunity(db, user.id, {
    name: validated.data.name,
    slug: validated.data.slug,
    description: validated.data.description ?? null,
    isPrivate: validated.data.isPrivate ?? false,
  });

  if (!created.ok) {
    if (created.reason === "slug_taken") {
      return NextResponse.json({ error: { slug: ["Slug already taken"] } }, { status: 400 });
    }
    return NextResponse.json({ error: { _form: ["Invalid community data"] } }, { status: 400 });
  }

  const row = await col<CommunityDoc>(db, "communities").findOne({
    _id: created.communityId,
  } as never);
  const owners = await resolveAuthors(db, row ? [row.ownerId] : []);
  return NextResponse.json({
    community: row
      ? toCommunityJSON({
          ...row,
          memberCount: 1,
          isMember: true,
          isOwner: true,
          memberRole: "owner",
          owner: owners.get(row.ownerId.toHexString()) ?? null,
        } as unknown as Record<string, unknown>)
      : null,
  });
}
