import { Db, ObjectId } from "mongodb";
import {
  col,
  type CommunityDoc,
  type CommunityMemberDoc,
  type CommunityMemberRole,
  type CommunityPostDoc,
} from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serialize, serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";

const SLUG_RE = /^[a-z0-9-]{3,50}$/;

export async function createCommunity(
  db: Db,
  ownerId: string | ObjectId,
  input: { name: string; slug: string; description?: string | null; isPrivate?: boolean }
) {
  if (!SLUG_RE.test(input.slug)) {
    return { ok: false as const, reason: "bad_slug" as const };
  }
  if (input.name.trim().length < 3 || input.name.length > 100) {
    return { ok: false as const, reason: "bad_name" as const };
  }
  const now = new Date();
  try {
    const res = await col<CommunityDoc>(db, "communities").insertOne({
      slug: input.slug,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      imageUrl: null,
      ownerId: toObjectId(ownerId),
      isPrivate: !!input.isPrivate,
      createdAt: now,
      updatedAt: now,
    } as never);
    await col<CommunityMemberDoc>(db, "communityMembers").insertOne({
      communityId: res.insertedId,
      userId: toObjectId(ownerId),
      role: "owner",
      joinedAt: now,
    } as never);
    return { ok: true as const, communityId: res.insertedId };
  } catch (err: unknown) {
    if (err instanceof Error && /duplicate key/i.test(err.message)) {
      return { ok: false as const, reason: "slug_taken" as const };
    }
    throw err;
  }
}

export async function getCommunity(db: Db, id: string | ObjectId) {
  const row = await col<CommunityDoc>(db, "communities").findOne({ _id: toObjectId(id) } as never);
  if (!row) return null;
  const memberCount = await col<CommunityMemberDoc>(db, "communityMembers").countDocuments({
    communityId: row._id,
  } as never);
  return serialize({ ...row, memberCount });
}

export async function memberRole(
  db: Db,
  communityId: string | ObjectId,
  userId: string | ObjectId
): Promise<CommunityMemberRole | null> {
  const row = await col<CommunityMemberDoc>(db, "communityMembers").findOne({
    communityId: toObjectId(communityId),
    userId: toObjectId(userId),
  } as never);
  return row?.role ?? null;
}

export async function joinCommunity(db: Db, communityId: string | ObjectId, userId: string | ObjectId) {
  const community = await col<CommunityDoc>(db, "communities").findOne({
    _id: toObjectId(communityId),
  } as never);
  if (!community) return { ok: false as const, reason: "not_found" as const };
  if (community.isPrivate) {
    const existing = await memberRole(db, communityId, userId);
    if (!existing && !community.ownerId.equals(toObjectId(userId))) {
      return { ok: false as const, reason: "private" as const };
    }
  }
  try {
    await col<CommunityMemberDoc>(db, "communityMembers").insertOne({
      communityId: toObjectId(communityId),
      userId: toObjectId(userId),
      role: "member",
      joinedAt: new Date(),
    } as never);
    return { ok: true as const };
  } catch (err: unknown) {
    if (err instanceof Error && /duplicate key/i.test(err.message)) {
      return { ok: true as const, already: true as const };
    }
    throw err;
  }
}

/**
 * Leave (self) or remove (owner/moderator removing someone else).
 * Owners cannot be removed by anyone but themselves leaving is blocked too
 * (an owned community must be deleted or transferred — out of scope).
 */
export async function leaveCommunity(
  db: Db,
  communityId: string | ObjectId,
  targetUserId: string | ObjectId,
  actorId: string | ObjectId,
  isAdmin = false
) {
  const cid = toObjectId(communityId);
  const target = toObjectId(targetUserId);
  const actor = toObjectId(actorId);
  const community = await col<CommunityDoc>(db, "communities").findOne({ _id: cid } as never);
  if (!community) return { ok: false as const, reason: "not_found" as const };

  const self = target.equals(actor);
  if (!self) {
    const role = await memberRole(db, cid, actor);
    const isOwner = community.ownerId.equals(actor);
    if (!isAdmin && !isOwner && role !== "moderator") {
      return { ok: false as const, reason: "forbidden" as const };
    }
    if (target.equals(community.ownerId)) {
      return { ok: false as const, reason: "cannot_remove_owner" as const };
    }
    // Removing a fellow moderator is owner/admin-only (consistent with
    // setMemberRole, where touching moderators is owner-only).
    if (!isAdmin && !isOwner) {
      const targetRole = await memberRole(db, cid, target);
      if (targetRole === "moderator") {
        return { ok: false as const, reason: "forbidden" as const };
      }
    }
  } else if (target.equals(community.ownerId)) {
    return { ok: false as const, reason: "owner_cannot_leave" as const };
  }

  await col<CommunityMemberDoc>(db, "communityMembers").deleteOne({
    communityId: cid,
    userId: target,
  } as never);
  return { ok: true as const };
}

export async function setMemberRole(
  db: Db,
  communityId: string | ObjectId,
  targetUserId: string | ObjectId,
  actorId: string | ObjectId,
  role: "member" | "moderator",
  isAdmin = false
) {
  const cid = toObjectId(communityId);
  const target = toObjectId(targetUserId);
  const actor = toObjectId(actorId);
  const community = await col<CommunityDoc>(db, "communities").findOne({ _id: cid } as never);
  if (!community) return { ok: false as const, reason: "not_found" as const };
  const isOwner = community.ownerId.equals(actor) || isAdmin;
  const actorRole = await memberRole(db, cid, actor);
  if (!isOwner && actorRole !== "moderator") {
    return { ok: false as const, reason: "forbidden" as const };
  }
  if (target.equals(community.ownerId)) {
    return { ok: false as const, reason: "cannot_change_owner" as const };
  }
  // Moderators may only keep members as members; promoting to moderator
  // and touching other moderators is owner-only.
  if (!isOwner && role === "moderator") {
    return { ok: false as const, reason: "owner_only_promote" as const };
  }
  const targetRole = await memberRole(db, cid, target);
  if (!targetRole) return { ok: false as const, reason: "not_member" as const };
  if (!isOwner && targetRole === "moderator") {
    return { ok: false as const, reason: "owner_only_demote" as const };
  }
  await col<CommunityMemberDoc>(db, "communityMembers").updateOne(
    { communityId: cid, userId: target } as never,
    { $set: { role } }
  );
  return { ok: true as const };
}

export async function listMembers(db: Db, communityId: string | ObjectId) {
  const rows = await col<CommunityMemberDoc>(db, "communityMembers")
    .find({ communityId: toObjectId(communityId) } as never)
    .sort({ joinedAt: 1 })
    .limit(200)
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.userId));
  return serializeMany(
    rows.map((r) => ({ ...r, user: authors.get(r.userId.toHexString()) ?? null }))
  );
}

export async function createCommunityPost(
  db: Db,
  communityId: string | ObjectId,
  authorId: string | ObjectId,
  content: string
) {
  const text = content.trim();
  if (!text) return { ok: false as const, reason: "empty" as const };
  const role = await memberRole(db, communityId, authorId);
  if (!role) {
    const community = await col<CommunityDoc>(db, "communities").findOne({
      _id: toObjectId(communityId),
    } as never);
    if (!community || community.isPrivate) {
      return { ok: false as const, reason: "forbidden" as const };
    }
  }
  const now = new Date();
  const res = await col<CommunityPostDoc>(db, "communityPosts").insertOne({
    communityId: toObjectId(communityId),
    authorId: toObjectId(authorId),
    content: text,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as never);
  return { ok: true as const, postId: res.insertedId };
}

export async function listCommunityPosts(
  db: Db,
  communityId: string | ObjectId,
  limit = 20,
  before?: Date
) {
  const filter: Record<string, unknown> = {
    communityId: toObjectId(communityId),
    deletedAt: null,
  };
  if (before) filter.createdAt = { $lt: before };
  const rows = await col<CommunityPostDoc>(db, "communityPosts")
    .find(filter as never)
    .sort({ createdAt: -1 })
    .limit(safeLimit(limit, 50))
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.authorId));
  return serializeMany(
    rows.map((r) => ({ ...r, author: authors.get(r.authorId.toHexString()) ?? null }))
  );
}

export async function updateCommunity(
  db: Db,
  communityId: string | ObjectId,
  actorId: string | ObjectId,
  patch: { name?: string; description?: string | null; isPrivate?: boolean },
  isAdmin = false
) {
  const cid = toObjectId(communityId);
  const community = await col<CommunityDoc>(db, "communities").findOne({ _id: cid } as never);
  if (!community) return { ok: false as const, reason: "not_found" as const };
  const role = await memberRole(db, cid, actorId);
  const canEdit =
    isAdmin ||
    community.ownerId.equals(toObjectId(actorId)) ||
    role === "moderator";
  if (!canEdit) return { ok: false as const, reason: "forbidden" as const };
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    if (patch.name.trim().length < 3 || patch.name.length > 100) {
      return { ok: false as const, reason: "bad_name" as const };
    }
    update.name = patch.name.trim();
  }
  if (patch.description !== undefined) update.description = patch.description;
  // Flipping community visibility is owner/admin-only; moderators may edit
  // name/description but must not expose or hide the community.
  if (patch.isPrivate !== undefined) {
    const isOwner = community.ownerId.equals(toObjectId(actorId));
    if (!isAdmin && !isOwner) {
      return { ok: false as const, reason: "forbidden" as const };
    }
    update.isPrivate = patch.isPrivate;
  }
  await col<CommunityDoc>(db, "communities").updateOne({ _id: cid } as never, { $set: update });
  return { ok: true as const };
}
