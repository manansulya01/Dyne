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
      rules: [],
      createdAt: now,
      updatedAt: now,
    } as never);
    await col<CommunityMemberDoc>(db, "communityMembers").insertOne({
      communityId: res.insertedId,
      userId: toObjectId(ownerId),
      role: "owner",
      joinedAt: now,
    } as never);
    // Every community starts with a #general channel.
    await col(db, "communityChannels").insertOne({
      communityId: res.insertedId,
      name: "general",
      topic: "General discussion",
      position: 0,
      createdBy: toObjectId(ownerId),
      createdAt: now,
      updatedAt: now,
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
    // Moderators and admins may remove members; admins may additionally
    // remove moderators. Touching admins stays owner-only.
    if (!isAdmin && !isOwner && role !== "moderator" && role !== "admin") {
      return { ok: false as const, reason: "forbidden" as const };
    }
    if (target.equals(community.ownerId)) {
      return { ok: false as const, reason: "cannot_remove_owner" as const };
    }
    if (!isAdmin && !isOwner) {
      const targetRole = await memberRole(db, cid, target);
      if (targetRole === "admin" || (targetRole === "moderator" && role !== "admin")) {
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
  role: "member" | "moderator" | "admin",
  isAdmin = false
) {
  const cid = toObjectId(communityId);
  const target = toObjectId(targetUserId);
  const actor = toObjectId(actorId);
  const community = await col<CommunityDoc>(db, "communities").findOne({ _id: cid } as never);
  if (!community) return { ok: false as const, reason: "not_found" as const };
  const isOwner = community.ownerId.equals(actor) || isAdmin;
  const actorRole = await memberRole(db, cid, actor);
  if (!isOwner && actorRole !== "admin" && actorRole !== "moderator") {
    return { ok: false as const, reason: "forbidden" as const };
  }
  if (target.equals(community.ownerId)) {
    return { ok: false as const, reason: "cannot_change_owner" as const };
  }
  const targetRole = await memberRole(db, cid, target);
  if (!targetRole) return { ok: false as const, reason: "not_member" as const };
  // Hierarchy: owner > admin > moderator > member.
  // - Only the owner (or platform admin) may assign/remove the admin role
  //   or touch another admin.
  // - Admins may promote members to moderator and demote moderators.
  // - Moderators cannot change roles.
  if (!isOwner && (role === "admin" || targetRole === "admin")) {
    return { ok: false as const, reason: "owner_only_admin" as const };
  }
  if (!isOwner && actorRole === "moderator") {
    return { ok: false as const, reason: "forbidden" as const };
  }
  if (!isOwner && role === "moderator" && actorRole !== "admin") {
    return { ok: false as const, reason: "owner_only_promote" as const };
  }
  if (!isOwner && targetRole === "moderator" && actorRole !== "admin") {
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
    .sort({ joinedAt: 1, _id: 1 })
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
    isPinned: false,
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
  const cid = toObjectId(communityId);
  const filter: Record<string, unknown> = {
    communityId: cid,
    deletedAt: null,
  };
  if (before) filter.createdAt = { $lt: before };
  const rows = await col<CommunityPostDoc>(db, "communityPosts")
    .find(filter as never)
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit(limit, 50))
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.authorId));
  const serialized = serializeMany(
    rows.map((r) => ({ ...r, author: authors.get(r.authorId.toHexString()) ?? null }))
  );
  if (before) return serialized;
  // First page: pinned discussions float to the top (max 5), then latest.
  // Cursor pagination on later pages stays strictly chronological, so pinned
  // items never duplicate or vanish across pages.
  const pinned = serialized.filter((p) => (p as unknown as Record<string, unknown>).isPinned).slice(0, 5);
  if (pinned.length === 0) return serialized;
  const pinnedIds = new Set(pinned.map((p) => String((p as unknown as Record<string, unknown>).id)));
  return [
    ...pinned,
    ...serialized.filter((p) => !pinnedIds.has(String((p as unknown as Record<string, unknown>).id))),
  ];
}

/** Pin/unpin a discussion. Owner, community admin/moderator, or platform admin. */
export async function setPostPinned(
  db: Db,
  postId: string | ObjectId,
  actorId: string | ObjectId,
  pinned: boolean,
  isPlatformAdmin = false
) {
  const pid = toObjectId(postId);
  const post = await col<CommunityPostDoc>(db, "communityPosts").findOne({ _id: pid } as never);
  if (!post || post.deletedAt) return { ok: false as const, reason: "not_found" as const };
  const community = await col<CommunityDoc>(db, "communities").findOne({ _id: post.communityId } as never);
  if (!community) return { ok: false as const, reason: "not_found" as const };
  const role = await memberRole(db, post.communityId, actorId);
  const allowed =
    isPlatformAdmin ||
    community.ownerId.equals(toObjectId(actorId)) ||
    role === "admin" ||
    role === "moderator";
  if (!allowed) return { ok: false as const, reason: "forbidden" as const };
  await col<CommunityPostDoc>(db, "communityPosts").updateOne(
    { _id: pid } as never,
    { $set: { isPinned: pinned, updatedAt: new Date() } }
  );
  return { ok: true as const };
}

export async function updateCommunity(
  db: Db,
  communityId: string | ObjectId,
  actorId: string | ObjectId,
  patch: { name?: string; description?: string | null; isPrivate?: boolean; rules?: string[] },
  isAdmin = false
) {
  const cid = toObjectId(communityId);
  const community = await col<CommunityDoc>(db, "communities").findOne({ _id: cid } as never);
  if (!community) return { ok: false as const, reason: "not_found" as const };
  const role = await memberRole(db, cid, actorId);
  const canEdit =
    isAdmin ||
    community.ownerId.equals(toObjectId(actorId)) ||
    role === "admin" ||
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
  if (patch.rules !== undefined) {
    const rules = patch.rules
      .filter((r) => typeof r === "string")
      .map((r) => r.trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 10);
    update.rules = rules;
  }
  await col<CommunityDoc>(db, "communities").updateOne({ _id: cid } as never, { $set: update });
  return { ok: true as const };
}

/** Cross-community discussion feed: latest posts from communities the user joined. */
export async function listCommunityFeed(
  db: Db,
  userId: string | ObjectId,
  limit = 20,
  before?: Date
) {
  const uid = toObjectId(userId);
  const memberships = await col<CommunityMemberDoc>(db, "communityMembers")
    .find({ userId: uid } as never)
    .project({ communityId: 1 })
    .toArray();
  const ids = memberships.map((m) => m.communityId);
  if (ids.length === 0) return [];
  const filter: Record<string, unknown> = {
    communityId: { $in: ids },
    deletedAt: null,
  };
  if (before) filter.createdAt = { $lt: before };
  const rows = await col<CommunityPostDoc>(db, "communityPosts")
    .find(filter as never)
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit(limit, 50))
    .toArray();
  if (rows.length === 0) return [];
  const [authors, comms] = await Promise.all([
    resolveAuthors(db, rows.map((r) => r.authorId)),
    col<CommunityDoc>(db, "communities")
      .find({ _id: { $in: [...new Map(rows.map((r) => [r.communityId.toHexString(), r.communityId])).values()] } } as never)
      .project({ name: 1, slug: 1 })
      .toArray(),
  ]);
  const commBy = new Map(comms.map((c) => [c._id.toHexString(), c]));
  return serializeMany(
    rows.map((r) => ({
      ...r,
      author: authors.get(r.authorId.toHexString()) ?? null,
      community: (() => {
        const c = commBy.get(r.communityId.toHexString());
        return c ? { id: c._id.toHexString(), name: c.name, slug: c.slug } : null;
      })(),
    }))
  );
}
