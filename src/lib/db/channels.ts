import { Db, ObjectId } from "mongodb";
import {
  col,
  type CommunityChannelDoc,
  type CommunityDoc,
  type CommunityMemberRole,
} from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { serializeMany } from "./serialize";
import { memberRole } from "./communities";
import { safeLimit } from "@/lib/utils";

const NAME_RE = /^[a-zA-Z0-9 _-]{2,40}$/;

function canManage(
  isOwner: boolean,
  role: CommunityMemberRole | null,
  platformAdmin: boolean
): boolean {
  return platformAdmin || isOwner || role === "admin" || role === "moderator";
}

export async function createChannel(
  db: Db,
  communityId: string | ObjectId,
  actorId: string | ObjectId,
  input: { name: string; topic?: string | null },
  platformAdmin = false
) {
  const cid = toObjectId(communityId);
  const community = await col<CommunityDoc>(db, "communities").findOne({ _id: cid } as never);
  if (!community) return { ok: false as const, reason: "not_found" as const };
  const name = input.name.trim().toLowerCase().replace(/\s+/g, "-");
  if (!NAME_RE.test(input.name.trim()) || name.length < 2 || name.length > 40) {
    return { ok: false as const, reason: "bad_name" as const };
  }
  const role = await memberRole(db, cid, actorId);
  const isOwner = community.ownerId.equals(toObjectId(actorId));
  if (!canManage(isOwner, role, platformAdmin)) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const count = await col<CommunityChannelDoc>(db, "communityChannels").countDocuments({ communityId: cid } as never);
  if (count >= 25) return { ok: false as const, reason: "too_many" as const };
  const now = new Date();
  try {
    const res = await col<CommunityChannelDoc>(db, "communityChannels").insertOne({
      communityId: cid,
      name,
      topic: input.topic?.trim().slice(0, 140) || null,
      position: count,
      createdBy: toObjectId(actorId),
      createdAt: now,
      updatedAt: now,
    } as never);
    return { ok: true as const, channelId: res.insertedId };
  } catch (err: unknown) {
    if (err instanceof Error && /duplicate key/i.test(err.message)) {
      return { ok: false as const, reason: "name_taken" as const };
    }
    throw err;
  }
}

export async function listChannels(
  db: Db,
  communityId: string | ObjectId,
  viewerId: string | ObjectId,
  opts: { isPlatformAdmin?: boolean } = {}
) {
  const cid = toObjectId(communityId);
  const community = await col<CommunityDoc>(db, "communities").findOne({ _id: cid } as never);
  if (!community) return { ok: false as const, reason: "not_found" as const };
  const role = await memberRole(db, cid, viewerId);
  const isOwner = community.ownerId.equals(toObjectId(viewerId));
  if (community.isPrivate && !role && !isOwner && !opts.isPlatformAdmin) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  // Self-heal legacy communities created before channels existed: managers
  // get a #general on first list (viewers never trigger writes).
  let rows = await col<CommunityChannelDoc>(db, "communityChannels")
    .find({ communityId: cid } as never)
    .sort({ position: 1, _id: 1 })
    .limit(safeLimit(30, 30))
    .toArray();
  if (rows.length === 0 && (canManage(isOwner, role, !!opts.isPlatformAdmin))) {
    const now = new Date();
    try {
      await col<CommunityChannelDoc>(db, "communityChannels").insertOne({
        communityId: cid,
        name: "general",
        topic: "General discussion",
        position: 0,
        createdBy: toObjectId(viewerId),
        createdAt: now,
        updatedAt: now,
      } as never);
    } catch { /* raced insert — fall through to re-read */ }
    rows = await col<CommunityChannelDoc>(db, "communityChannels")
      .find({ communityId: cid } as never)
      .sort({ position: 1, _id: 1 })
      .limit(safeLimit(30, 30))
      .toArray();
  }
  // Per-channel conversation + unread counts in two bounded queries.
  const channelIds = rows.map((r) => r._id);
  const convoCounts = channelIds.length
    ? await col(db, "chatConversations")
        .aggregate([
          { $match: { channelId: { $in: channelIds } } },
          { $group: { _id: "$channelId", n: { $sum: 1 } } },
        ])
        .toArray()
    : [];
  const countBy = new Map(
    (convoCounts as Array<{ _id: ObjectId; n: number }>).map((r) => [r._id.toHexString(), r.n])
  );
  return {
    ok: true as const,
    channels: serializeMany(
      rows.map((r) => ({
        ...r,
        conversationCount: countBy.get(r._id.toHexString()) ?? 0,
        canManage: canManage(isOwner, role, !!opts.isPlatformAdmin),
      }))
    ),
  };
}

export async function renameChannel(
  db: Db,
  channelId: string | ObjectId,
  actorId: string | ObjectId,
  input: { name?: string; topic?: string | null },
  platformAdmin = false
) {
  const ch = await col<CommunityChannelDoc>(db, "communityChannels").findOne({
    _id: toObjectId(channelId),
  } as never);
  if (!ch) return { ok: false as const, reason: "not_found" as const };
  const community = await col<CommunityDoc>(db, "communities").findOne({ _id: ch.communityId } as never);
  if (!community) return { ok: false as const, reason: "not_found" as const };
  const role = await memberRole(db, ch.communityId, actorId);
  const isOwner = community.ownerId.equals(toObjectId(actorId));
  if (!canManage(isOwner, role, platformAdmin)) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = input.name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!NAME_RE.test(input.name.trim()) || name.length < 2 || name.length > 40) {
      return { ok: false as const, reason: "bad_name" as const };
    }
    patch.name = name;
  }
  if (input.topic !== undefined) patch.topic = input.topic?.trim().slice(0, 140) || null;
  try {
    await col<CommunityChannelDoc>(db, "communityChannels").updateOne(
      { _id: ch._id } as never,
      { $set: patch }
    );
  } catch (err: unknown) {
    if (err instanceof Error && /duplicate key/i.test(err.message)) {
      return { ok: false as const, reason: "name_taken" as const };
    }
    throw err;
  }
  return { ok: true as const };
}

export async function deleteChannel(
  db: Db,
  channelId: string | ObjectId,
  actorId: string | ObjectId,
  platformAdmin = false
) {
  const ch = await col<CommunityChannelDoc>(db, "communityChannels").findOne({
    _id: toObjectId(channelId),
  } as never);
  if (!ch) return { ok: false as const, reason: "not_found" as const };
  const community = await col<CommunityDoc>(db, "communities").findOne({ _id: ch.communityId } as never);
  if (!community) return { ok: false as const, reason: "not_found" as const };
  const isOwner = community.ownerId.equals(toObjectId(actorId));
  // Deleting a channel is owner/platform-admin only (it unlinks conversations).
  if (!platformAdmin && !isOwner) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const remaining = await col<CommunityChannelDoc>(db, "communityChannels").countDocuments({
    communityId: ch.communityId,
  } as never);
  if (remaining <= 1) return { ok: false as const, reason: "last_channel" as const };
  await col(db, "chatConversations").updateMany(
    { channelId: ch._id } as never,
    { $set: { channelId: null } }
  );
  await col<CommunityChannelDoc>(db, "communityChannels").deleteOne({ _id: ch._id } as never);
  return { ok: true as const };
}
