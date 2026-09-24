import { Db, ObjectId } from "mongodb";
import {
  col,
  type ConversationDoc,
  type ConversationMemberDoc,
  type MessageAttachment,
  type MessageDoc,
} from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serialize, serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";

export async function isConversationMember(
  db: Db,
  conversationId: string | ObjectId,
  userId: string | ObjectId
) {
  const row = await col<ConversationMemberDoc>(db, "chatMembers").findOne({
    conversationId: toObjectId(conversationId),
    userId: toObjectId(userId),
  } as never);
  return !!row;
}

/** Create a direct or group conversation with the creator as first member. */
export async function createConversation(
  db: Db,
  creatorId: string | ObjectId,
  input: { type: "direct" | "group"; participantIds: Array<string | ObjectId>; name?: string }
) {
  const creator = toObjectId(creatorId);
  const seen = new Map<string, ObjectId>();
  for (const raw of input.participantIds) {
    const id = toObjectId(raw);
    if (!id.equals(creator)) seen.set(id.toHexString(), id);
  }
  const others = [...seen.values()];
  if (input.type === "direct" && others.length !== 1) {
    return { ok: false as const, reason: "direct_needs_one" as const };
  }
  if (others.length === 0) {
    return { ok: false as const, reason: "no_participants" as const };
  }
  // Every participant must exist.
  const existing = await col(db, "users")
    .find({ _id: { $in: others } } as never)
    .project({ _id: 1 })
    .toArray();
  if (existing.length !== others.length) {
    return { ok: false as const, reason: "unknown_user" as const };
  }

  // Reuse an existing direct conversation between the same pair.
  if (input.type === "direct") {
    const pair = [creator, others[0]];
    const candidates = await col<ConversationMemberDoc>(db, "chatMembers")
      .aggregate([
        { $match: { userId: { $in: pair } } },
        { $group: { _id: "$conversationId", members: { $addToSet: "$userId" } } },
        { $match: { members: { $size: 2 } } },
      ])
      .toArray();
    for (const c of candidates as Array<{ _id: ObjectId; members: ObjectId[] }>) {
      const set = new Set(c.members.map((m) => m.toHexString()));
      if (set.has(creator.toHexString()) && set.has(others[0].toHexString()) && set.size === 2) {
        const convo = await col<ConversationDoc>(db, "chatConversations").findOne({
          _id: c._id,
          type: "direct",
        } as never);
        if (convo) return { ok: true as const, conversationId: convo._id, reused: true as const };
      }
    }
  }

  const now = new Date();
  const convo = await col<ConversationDoc>(db, "chatConversations").insertOne({
    type: input.type,
    name: input.type === "group" ? input.name?.trim() || "Group chat" : null,
    imageUrl: null,
    createdBy: creator,
    createdAt: now,
    updatedAt: now,
  } as never);
  await col<ConversationMemberDoc>(db, "chatMembers").insertMany(
    [creator, ...others].map((userId) => ({
      conversationId: convo.insertedId,
      userId,
      role: userId.equals(creator) ? "admin" : "member",
      lastReadAt: null,
      joinedAt: now,
    }) as never)
  );
  return { ok: true as const, conversationId: convo.insertedId };
}

/** Conversations for a user, newest activity first, with last message + unread flag. */
export async function listConversations(db: Db, userId: string | ObjectId, limit = 20) {
  const uid = toObjectId(userId);
  const memberships = await col<ConversationMemberDoc>(db, "chatMembers")
    .find({ userId: uid } as never)
    .toArray();
  if (memberships.length === 0) return [];
  const byConvo = new Map(memberships.map((m) => [m.conversationId.toHexString(), m]));
  const convos = await col<ConversationDoc>(db, "chatConversations")
    .find({ _id: { $in: [...byConvo.keys()].map((id) => new ObjectId(id)) } } as never)
    .sort({ updatedAt: -1 })
    .limit(safeLimit(limit, 50))
    .toArray();

  const convoIds = convos.map((c) => c._id);
  const lastMessages = await col<MessageDoc>(db, "chatMessages")
    .aggregate([
      { $match: { conversationId: { $in: convoIds }, deletedAt: null } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$conversationId", message: { $first: "$$ROOT" } } },
    ])
    .toArray();
  const lastByConvo = new Map(
    (lastMessages as Array<{ _id: ObjectId; message: MessageDoc }>).map((r) => [
      r._id.toHexString(),
      r.message,
    ])
  );
  const memberRows = await col<ConversationMemberDoc>(db, "chatMembers")
    .find({ conversationId: { $in: convoIds } } as never)
    .toArray();
  const authors = await resolveAuthors(
    db,
    memberRows.map((m) => m.userId)
  );

  return serializeMany(
    convos.map((c) => {
      const mine = byConvo.get(c._id.toHexString())!;
      const last = lastByConvo.get(c._id.toHexString()) ?? null;
      const others = memberRows
        .filter((m) => m.conversationId.equals(c._id) && !m.userId.equals(uid))
        .map((m) => authors.get(m.userId.toHexString()) ?? null);
      return {
        ...c,
        members: memberRows.filter((m) => m.conversationId.equals(c._id)).length,
        otherMembers: others,
        lastMessage: last,
        unread: !!last && (!mine.lastReadAt || last.createdAt > mine.lastReadAt),
      };
    })
  );
}

export async function sendMessage(
  db: Db,
  conversationId: string | ObjectId,
  senderId: string | ObjectId,
  content: string,
  attachments: MessageAttachment[] = []
) {
  const text = content.trim();
  if (!text && attachments.length === 0) {
    return { ok: false as const, reason: "empty" as const };
  }
  if (text.length > 10000) return { ok: false as const, reason: "too_long" as const };
  if (!(await isConversationMember(db, conversationId, senderId))) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const now = new Date();
  const res = await col<MessageDoc>(db, "chatMessages").insertOne({
    conversationId: toObjectId(conversationId),
    senderId: toObjectId(senderId),
    content: text || null,
    attachments,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as never);
  await col<ConversationDoc>(db, "chatConversations").updateOne(
    { _id: toObjectId(conversationId) } as never,
    { $set: { updatedAt: now } }
  );
  return { ok: true as const, messageId: res.insertedId };
}

export async function listMessages(
  db: Db,
  conversationId: string | ObjectId,
  userId: string | ObjectId,
  limit = 50
) {
  if (!(await isConversationMember(db, conversationId, userId))) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const rows = (
    await col<MessageDoc>(db, "chatMessages")
      .find({ conversationId: toObjectId(conversationId), deletedAt: null } as never)
      // Newest N first, then reverse to chronological: long threads show the
      // latest messages (oldest-N would hide everything past the limit).
      .sort({ createdAt: -1 })
      .limit(safeLimit(limit, 100, 50))
      .toArray()
  ).reverse();
  const authors = await resolveAuthors(db, rows.map((r) => r.senderId));
  // Mark read up to now.
  await col<ConversationMemberDoc>(db, "chatMembers").updateOne(
    { conversationId: toObjectId(conversationId), userId: toObjectId(userId) } as never,
    { $set: { lastReadAt: new Date() } }
  );
  return {
    ok: true as const,
    messages: serializeMany(
      rows.map((r) => ({ ...r, sender: authors.get(r.senderId.toHexString()) ?? null }))
    ),
  };
}

export async function addGroupMembers(
  db: Db,
  conversationId: string | ObjectId,
  actorId: string | ObjectId,
  userIds: Array<string | ObjectId>
) {
  const cid = toObjectId(conversationId);
  const convo = await col<ConversationDoc>(db, "chatConversations").findOne({ _id: cid } as never);
  if (!convo) return { ok: false as const, reason: "not_found" as const };
  if (convo.type !== "group") return { ok: false as const, reason: "direct_only" as const };
  if (!(await isConversationMember(db, cid, actorId))) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const now = new Date();
  // Every added user must exist (no dangling memberships or ghost notifications).
  const uniqueIds = [...new Map(userIds.map((raw) => [toObjectId(raw).toHexString(), toObjectId(raw)] as const)).values()];
  if (uniqueIds.length > 0) {
    const existing = await col(db, "users")
      .find({ _id: { $in: uniqueIds } } as never)
      .project({ _id: 1 })
      .toArray();
    if (existing.length !== uniqueIds.length) {
      return { ok: false as const, reason: "unknown_user" as const };
    }
  }
  let added = 0;
  for (const userId of uniqueIds) {
    try {
      await col<ConversationMemberDoc>(db, "chatMembers").insertOne({
        conversationId: cid,
        userId,
        role: "member",
        lastReadAt: null,
        joinedAt: now,
      } as never);
      added += 1;
    } catch (err: unknown) {
      if (!(err instanceof Error && /duplicate key/i.test(err.message))) throw err;
    }
  }
  return { ok: true as const, added };
}
