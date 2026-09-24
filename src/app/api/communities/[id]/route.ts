import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type CommunityDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { communityCreateSchema } from "@/lib/validation";
import { getCommunity, memberRole, updateCommunity } from "@/lib/db/communities";
import { resolveAuthors } from "@/lib/db/authors";
import { toCommunityJSON } from "@/lib/db/contracts";
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

async function communityPayload(db: Awaited<ReturnType<typeof getDb>>, id: string, userId: string) {
  const row = await getCommunity(db, id);
  if (!row) return null;
  const raw = row as unknown as Record<string, unknown>;
  const role = await memberRole(db, id, userId);
  const ownerId = String(raw.ownerId ?? raw.owner_id);
  const owners = await resolveAuthors(db, [toObjectId(ownerId)]);
  return toCommunityJSON({
    ...raw,
    isMember: !!role,
    isOwner: ownerId === userId,
    memberRole: role ?? "none",
    owner: owners.get(ownerId) ?? null,
  });
}

export async function GET(_request: Request, { params }: Params) {
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

  const role = await memberRole(db, id, user.id);
  if (
    community.isPrivate &&
    !role &&
    !community.ownerId.equals(toObjectId(user.id)) &&
    user.role !== "admin"
  ) {
    return NextResponse.json({ error: "This community is private" }, { status: 403 });
  }

  const payload = await communityPayload(db, id, user.id);
  return NextResponse.json({ community: payload });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  if (body && typeof body === "object" && "slug" in (body as Record<string, unknown>)) {
    return NextResponse.json({ error: { slug: ["Slug cannot be changed"] } }, { status: 400 });
  }
  // NOTE: communityCreateSchema.isPrivate has a `.default(false)` which Zod
  // applies even under `.partial()` — an omitted key would parse to `false`
  // and flip private communities public. Gate on raw-body key presence so
  // omitted fields are never treated as intent.
  const rawBody = (body ?? {}) as Record<string, unknown>;
  const validated = communityCreateSchema.partial().safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const community = await col<CommunityDoc>(db, "communities").findOne({
    _id: toObjectId(id),
  } as never);
  if (!community) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  let canEdit =
    community.ownerId.equals(toObjectId(user.id)) || user.role === "admin";
  if (!canEdit) {
    const role = await memberRole(db, id, user.id);
    canEdit = role === "moderator" || role === "owner";
  }
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: { name?: string; description?: string | null; isPrivate?: boolean } = {};
  if (validated.data.name !== undefined) patch.name = validated.data.name;
  // description: only when the client sent the key (allows clearing to null).
  if ("description" in rawBody) patch.description = validated.data.description ?? null;
  // isPrivate: only when the client sent the key (see default() note above).
  if ("isPrivate" in rawBody && validated.data.isPrivate !== undefined) {
    patch.isPrivate = validated.data.isPrivate;
  }
  const result = await updateCommunity(
    db,
    id,
    user.id,
    patch,
    user.role === "admin"
  );
  if (!result.ok) {
    if (result.reason === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Invalid community data" }, { status: 400 });
  }

  // Moderators may edit details, but role elevation stays owner-only inside updateCommunity.
  const payload = await communityPayload(db, id, user.id);
  return NextResponse.json({ community: payload });
}

export async function DELETE(_request: Request, { params }: Params) {
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

  if (!community.ownerId.equals(toObjectId(user.id)) && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cid = toObjectId(id);
  await Promise.all([
    col(db, "communities").deleteOne({ _id: cid } as never),
    col(db, "communityMembers").deleteMany({ communityId: cid } as never),
    col(db, "communityPosts").deleteMany({ communityId: cid } as never),
  ]);
  return NextResponse.json({ success: true });
}
