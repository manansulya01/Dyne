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
import { serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";
import { moderateContent } from "@/lib/moderation";

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

/** Create a group/community conversation with the creator as first member.
 *  NOTE: student-to-student direct messages are disabled product-wide.
 *  `type: "direct"` always fails with `direct_disabled`. Community/group
 *  messaging remains fully supported, optionally scoped to a community the
 *  creator belongs to. */
export async function createConversation(
  db: Db,
  creatorId: string | ObjectId,
  input: { type: "direct" | "group"; participantIds: Array<string | ObjectId>; name?: string; communityId?: string | ObjectId | null; channelId?: string | ObjectId | null }
) {
  if (input.type === "direct") {
    return { ok: false as const, reason: "direct_disabled" as const };
  }
  const creator = toObjectId(creatorId);
  const seen = new Map<string, ObjectId>();
  for (const raw of input.participantIds) {
    const id = toObjectId(raw);
    if (!id.equals(creator)) seen.set(id.toHexString(), id);
  }
  const others = [...seen.values()];
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

  // Optional community scoping: creator must be a member of the community.
  let communityId: ObjectId | null = null;
  if (input.communityId) {
    try {
      communityId = toObjectId(input.communityId);
    } catch {
      return { ok: false as const, reason: "unknown_community" as const };
    }
    const membership = await col(db, "communityMembers").findOne({
      communityId,
      userId: creator,
    } as never);
    if (!membership) {
      return { ok: false as const, reason: "not_community_member" as const };
    }
  }

  // A one-to-one "group" is a DM in disguise, so the product rule is enforced
  // here rather than trusting the requested type: students may only open an
  // unscoped conversation when it really is a group (creator + 2+ others), or a
  // community/channel-scoped space (membership already checked below).
  if (!input.communityId && !input.channelId && others.length < 2) {
    const creatorRow = await col(db, "users")
      .findOne({ _id: creator } as never, { projection: { role: 1 } })
      .catch(() => null);
    const creatorRole = String(
      (creatorRow as unknown as { role?: string } | null)?.role ?? "student"
    );
    if (creatorRole === "student" || creatorRole === "club") {
      return { ok: false as const, reason: "direct_disabled" as const };
    }
  }

  // Optional channel scoping: the channel must belong to the same community
  // (a channel always implies its community).
  let channelId: ObjectId | null = null;
  if (input.channelId) {
    try {
      channelId = toObjectId(input.channelId);
    } catch {
      return { ok: false as const, reason: "unknown_channel" as const };
    }
    const channel = await col(db, "communityChannels").findOne({ _id: channelId } as never);
    if (!channel) {
      return { ok: false as const, reason: "unknown_channel" as const };
    }
    if (communityId && !channel.communityId.equals(communityId)) {
      return { ok: false as const, reason: "channel_mismatch" as const };
    }
    communityId = channel.communityId;
    const membership = await col(db, "communityMembers").findOne({
      communityId,
      userId: creator,
    } as never);
    if (!membership) {
      return { ok: false as const, reason: "not_community_member" as const };
    }
  }

  const now = new Date();
  const convo = await col<ConversationDoc>(db, "chatConversations").insertOne({
    type: "group",
    name: input.name?.trim().slice(0, 100) || "Group chat",
    imageUrl: null,
    createdBy: creator,
    communityId,
    channelId,
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

/** Conversations for a user, newest activity first, with last message + unread flag.
 *  Direct (legacy) conversations are excluded: DMs are disabled product-wide.
 *  Moderation access to legacy directs happens via admin audit paths, not this list. */
export async function listConversations(db: Db, userId: string | ObjectId, limit = 20) {
  const uid = toObjectId(userId);
  const memberships = await col<ConversationMemberDoc>(db, "chatMembers")
    .find({ userId: uid } as never)
    .toArray();
  if (memberships.length === 0) return [];
  const byConvo = new Map(memberships.map((m) => [m.conversationId.toHexString(), m]));
  const convos = await col<ConversationDoc>(db, "chatConversations")
    .find({ _id: { $in: [...byConvo.keys()].map((id) => new ObjectId(id)) }, type: "group" } as never)
    .sort({ updatedAt: -1, _id: -1 })
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
  // DMs disabled: only group/community conversations accept messages from
  // ordinary users. Moderators/admins may still post in legacy directs only
  // via explicit moderation flows (regular send is blocked for everyone to
  // prevent forged-conversation DM abuse).
  const convo = await col<ConversationDoc>(db, "chatConversations").findOne({
    _id: toObjectId(conversationId),
  } as never);
  if (!convo) return { ok: false as const, reason: "forbidden" as const };
  if (convo.type !== "group") {
    return { ok: false as const, reason: "direct_disabled" as const };
  }
  const now = new Date();
  // Resolve @username mentions server-side (max 10, members only).
  const mentions = await resolveMentions(db, convo._id, text);

  /* ---------------------- Moderation pipeline ---------------------- *
   * Runs AFTER authentication/authorization (membership + group-only) and
   * validation. High-confidence violations are never delivered; borderline
   * content is held for moderator review. The AI layer is additional — the
   * deterministic rules and human queue remain the primary mechanism.     */
  // Pre-allocate the message id so the moderation review is recorded against
  // the exact document (no guessing by timestamp).
  const messageId = new ObjectId();
  const moderation = await moderateContent(db, {
    contentType: "message",
    contentId: messageId,
    authorId: toObjectId(senderId),
    text,
    mediaUrl: attachments[0]?.url ?? null,
    mediaProvided: attachments.length > 0,
    conversationId: convo._id,
    // Short excerpt only: full private content never leaves the chat store.
    excerpt: text.slice(0, 120),
  });

  if (moderation.decision === "rejected") {
    // The review record exists for moderators; the message itself is never
    // stored, so nothing is delivered.
    return { ok: false as const, reason: "blocked" as const, moderationReason: moderation.reason };
  }

  const res = await col<MessageDoc>(db, "chatMessages").insertOne({
    _id: messageId,
    conversationId: toObjectId(conversationId),
    senderId: toObjectId(senderId),
    content: text || null,
    attachments,
    mentions,
    reactions: {},
    moderationStatus: moderation.decision,
    moderationReason: moderation.reason,
    moderationScore: moderation.score,
    createdAt: now,
    updatedAt: now,
    editedAt: null,
    deletedAt: null,
  } as never);
  await col<ConversationDoc>(db, "chatConversations").updateOne(
    { _id: toObjectId(conversationId) } as never,
    { $set: { updatedAt: now } }
  );
  return {
    ok: true as const,
    messageId: res.insertedId,
    moderationStatus: moderation.decision,
    heldForReview: moderation.decision !== "approved",
  };
}

export async function listMessages(
  db: Db,
  conversationId: string | ObjectId,
  userId: string | ObjectId,
  limit = 50,
  opts: { viewerRole?: string } = {}
) {
  if (!(await isConversationMember(db, conversationId, userId))) {
    // Moderators/admins may read legacy directs for moderation even without
    // membership; ordinary users (incl. students) get 403.
    const privileged = ["moderator", "admin", "super_admin", "staff", "teacher"].includes(opts.viewerRole ?? "");
    if (!privileged) return { ok: false as const, reason: "forbidden" as const };
    const convo = await col<ConversationDoc>(db, "chatConversations").findOne({
      _id: toObjectId(conversationId),
    } as never);
    if (!convo) return { ok: false as const, reason: "forbidden" as const };
  }
  const convoType = await col<ConversationDoc>(db, "chatConversations").findOne(
    { _id: toObjectId(conversationId) } as never
  );
  if (convoType && convoType.type !== "group") {
    const privileged = ["moderator", "admin", "super_admin", "staff", "teacher"].includes(opts.viewerRole ?? "");
    if (!privileged) return { ok: false as const, reason: "direct_disabled" as const };
  }
  const rows = (
    await col<MessageDoc>(db, "chatMessages")
      .find({ conversationId: toObjectId(conversationId), deletedAt: null } as never)
      // Newest N first, then reverse to chronological: long threads show the
      // latest messages (oldest-N would hide everything past the limit).
      .sort({ createdAt: -1, _id: -1 })
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

/** Extract @username mentions and resolve to member user ids (max 10). */
async function resolveMentions(db: Db, conversationId: ObjectId, text: string): Promise<ObjectId[]> {
  const names = [...new Set([...text.matchAll(/@([a-zA-Z0-9_]{3,30})/g)].map((m) => m[1]))].slice(0, 10);
  if (names.length === 0) return [];
  const users = await col(db, "users")
    .find({ username: { $in: names } } as never)
    .project({ _id: 1 })
    .toArray();
  if (users.length === 0) return [];
  const memberRows = await col<ConversationMemberDoc>(db, "chatMembers")
    .find({ conversationId, userId: { $in: users.map((u) => u._id) } } as never)
    .project({ userId: 1 })
    .toArray();
  return memberRows.map((m) => m.userId);
}

/** Edit own message (or any message as moderator/admin). Group conversations only. */
export async function editMessage(
  db: Db,
  messageId: string | ObjectId,
  actorId: string | ObjectId,
  actorRole: string,
  content: string
) {
  const text = content.trim();
  if (!text || text.length > 10000) return { ok: false as const, reason: "bad_content" as const };
  const mid = toObjectId(messageId);
  const msg = await col<MessageDoc>(db, "chatMessages").findOne({ _id: mid } as never);
  if (!msg || msg.deletedAt) return { ok: false as const, reason: "not_found" as const };
  const convo = await col<ConversationDoc>(db, "chatConversations").findOne({ _id: msg.conversationId } as never);
  if (!convo || convo.type !== "group") return { ok: false as const, reason: "direct_disabled" as const };
  const privileged = ["moderator", "admin", "super_admin", "staff", "teacher"].includes(actorRole);
  if (!msg.senderId.equals(toObjectId(actorId)) && !privileged) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  if (!(await isConversationMember(db, convo._id, actorId)) && !privileged) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const mentions = await resolveMentions(db, convo._id, text);
  await col<MessageDoc>(db, "chatMessages").updateOne(
    { _id: mid } as never,
    { $set: { content: text, mentions, editedAt: new Date(), updatedAt: new Date() } }
  );
  return { ok: true as const };
}

/** Soft-delete own message (or any message as moderator/admin). */
export async function deleteMessage(
  db: Db,
  messageId: string | ObjectId,
  actorId: string | ObjectId,
  actorRole: string
) {
  const mid = toObjectId(messageId);
  const msg = await col<MessageDoc>(db, "chatMessages").findOne({ _id: mid } as never);
  if (!msg || msg.deletedAt) return { ok: false as const, reason: "not_found" as const };
  const convo = await col<ConversationDoc>(db, "chatConversations").findOne({ _id: msg.conversationId } as never);
  if (!convo || convo.type !== "group") return { ok: false as const, reason: "direct_disabled" as const };
  const privileged = ["moderator", "admin", "super_admin", "staff", "teacher"].includes(actorRole);
  if (!msg.senderId.equals(toObjectId(actorId)) && !privileged) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  if (!(await isConversationMember(db, convo._id, actorId)) && !privileged) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  await col<MessageDoc>(db, "chatMessages").updateOne(
    { _id: mid } as never,
    { $set: { deletedAt: new Date(), updatedAt: new Date() } }
  );
  return { ok: true as const };
}

const ALLOWED_REACTIONS = new Set(["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"]);

/** Toggle an emoji reaction on a group message. */
export async function toggleMessageReaction(
  db: Db,
  messageId: string | ObjectId,
  actorId: string | ObjectId,
  emoji: string
) {
  if (!ALLOWED_REACTIONS.has(emoji)) return { ok: false as const, reason: "bad_emoji" as const };
  const mid = toObjectId(messageId);
  const msg = await col<MessageDoc>(db, "chatMessages").findOne({ _id: mid } as never);
  if (!msg || msg.deletedAt) return { ok: false as const, reason: "not_found" as const };
  const convo = await col<ConversationDoc>(db, "chatConversations").findOne({ _id: msg.conversationId } as never);
  if (!convo || convo.type !== "group") return { ok: false as const, reason: "direct_disabled" as const };
  if (!(await isConversationMember(db, convo._id, actorId))) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const uidHex = toObjectId(actorId).toHexString();
  const current: string[] = (msg.reactions?.[emoji] ?? []) as string[];
  const has = current.includes(uidHex);
  const next = has ? current.filter((id) => id !== uidHex) : [...current, uidHex].slice(0, 500);
  await col<MessageDoc>(db, "chatMessages").updateOne(
    { _id: mid } as never,
    { $set: { [`reactions.${emoji}`]: next, updatedAt: new Date() } }
  );
  return { ok: true as const, added: !has };
}
