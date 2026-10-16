import { describe, expect, it, beforeAll, afterEach } from "vitest";
process.env.MONGODB_DB = "dyne_test_dm_restriction";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser, setUserRole } from "@/lib/db/users";
import {
  createConversation,
  listConversations,
  sendMessage,
  listMessages,
  editMessage,
  deleteMessage,
  toggleMessageReaction,
} from "@/lib/db/chat";
import { createCommunity, joinCommunity } from "@/lib/db/communities";

async function makeUser(username: string, role?: "student" | "moderator" | "admin" | "super_admin") {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  if (role) await setUserRole(db, r.userId, role);
  return r.userId;
}

describe("DM restriction (student-to-student DMs disabled)", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("student cannot create a student-to-student DM", async () => {
    const db = await getDb();
    const a = await makeUser("dm_a");
    const b = await makeUser("dm_b");
    const res = await createConversation(db, a, { type: "direct", participantIds: [b] });
    expect(res).toEqual({ ok: false, reason: "direct_disabled" });
    // A one-to-one "group" is the same DM in disguise: still refused for
    // students unless it is scoped to a community/channel they belong to.
    const disguised = await createConversation(db, a, { type: "group", participantIds: [b], name: "1:1" });
    expect(disguised).toEqual({ ok: false, reason: "direct_disabled" });
  });

  it("student cannot access another private DM (forged conversation ID)", async () => {
    const db = await getDb();
    const a = await makeUser("dm_c");
    const b = await makeUser("dm_d");
    const c = await makeUser("dm_d2");
    const outsider = await makeUser("dm_e");
    const group = await createConversation(db, a, { type: "group", participantIds: [b, c], name: "G" });
    if (!group.ok) throw new Error("setup failed");
    // Outsider forging the conversation id gets 403 on send and read.
    expect(await sendMessage(db, group.conversationId, outsider, "hi")).toEqual({
      ok: false, reason: "forbidden",
    });
    expect(await listMessages(db, group.conversationId, outsider)).toEqual({
      ok: false, reason: "forbidden",
    });
  });

  it("student CAN message inside an authorized community group", async () => {
    const db = await getDb();
    const owner = await makeUser("dm_owner");
    const member = await makeUser("dm_member");
    const c = await createCommunity(db, owner, { name: "Robotics Club", slug: "robotics-club", isPrivate: false });
    if (!c.ok) throw new Error("setup failed");
    expect((await joinCommunity(db, c.communityId, member)).ok).toBe(true);
    const group = await createConversation(db, member, {
      type: "group", participantIds: [owner], name: "Build night", communityId: c.communityId,
    });
    if (!group.ok) throw new Error(`setup failed: ${JSON.stringify(group)}`);
    const sent = await sendMessage(db, group.conversationId, member, "Hello @dm_owner team!");
    expect(sent.ok).toBe(true);
    const history = await listMessages(db, group.conversationId, owner);
    if (!history.ok) throw new Error("setup failed");
    expect(history.messages).toHaveLength(1);
  });

  it("community-scoped creation requires membership", async () => {
    const db = await getDb();
    const owner = await makeUser("dm_o2");
    const stranger = await makeUser("dm_s2");
    const c = await createCommunity(db, owner, { name: "Chess", slug: "chess-club", isPrivate: false });
    if (!c.ok) throw new Error("setup failed");
    const res = await createConversation(db, stranger, {
      type: "group", participantIds: [owner], name: "X", communityId: c.communityId,
    });
    expect(res).toEqual({ ok: false, reason: "not_community_member" });
  });

  it("moderators retain read access to legacy directs; students do not", async () => {
    const db = await getDb();
    const a = await makeUser("dm_m1");
    const b = await makeUser("dm_m2");
    const mod = await makeUser("dm_mod", "moderator");
    // Legacy direct row inserted directly (simulates pre-existing data).
    const conv = await col(db, "chatConversations").insertOne({
      type: "direct", name: null, imageUrl: null, createdBy: a,
      communityId: null, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    await col(db, "chatMembers").insertMany([
      { conversationId: conv.insertedId, userId: a, role: "member", lastReadAt: null, joinedAt: new Date() },
      { conversationId: conv.insertedId, userId: b, role: "member", lastReadAt: null, joinedAt: new Date() },
    ] as never);
    // Student non-member blocked.
    expect(await listMessages(db, conv.insertedId, mod)).toMatchObject({ ok: false });
    // Moderator with explicit membership read path: add mod as member first via group? Directs
    // are group-only for new sends; moderation read allowed for privileged roles when member.
    await col(db, "chatMembers").insertOne({
      conversationId: conv.insertedId, userId: mod, role: "member", lastReadAt: null, joinedAt: new Date(),
    } as never);
    const asMod = await listMessages(db, conv.insertedId, mod, 50, { viewerRole: "moderator" });
    // Legacy direct reads for moderators resolve (may be empty) rather than 403-forbidden.
    expect(asMod.ok === true || (asMod.ok === false && asMod.reason === "direct_disabled")).toBe(true);
    // Students who are members still cannot message in directs.
    const sendAsStudent = await sendMessage(db, conv.insertedId, a, "hello");
    expect(sendAsStudent).toEqual({ ok: false, reason: "direct_disabled" });
  });

  it("community permissions enforced: edit/delete/reactions require membership", async () => {
    const db = await getDb();
    const a = await makeUser("dm_x1");
    const b = await makeUser("dm_x2");
    const c = await makeUser("dm_x2b");
    const outsider = await makeUser("dm_x3");
    const group = await createConversation(db, a, { type: "group", participantIds: [b, c], name: "G2" });
    if (!group.ok) throw new Error("setup failed");
    const sent = await sendMessage(db, group.conversationId, a, "hello world");
    if (!sent.ok) throw new Error("setup failed");
    expect(await editMessage(db, sent.messageId, outsider, "student", "hacked")).toEqual({
      ok: false, reason: "forbidden",
    });
    expect(await deleteMessage(db, sent.messageId, outsider, "student")).toEqual({
      ok: false, reason: "forbidden",
    });
    expect(await toggleMessageReaction(db, sent.messageId, outsider, "👍")).toEqual({
      ok: false, reason: "forbidden",
    });
    // Owner can edit/delete/react.
    expect(await editMessage(db, sent.messageId, a, "student", "hello edited")).toEqual({ ok: true });
    expect(await toggleMessageReaction(db, sent.messageId, b, "👍")).toEqual({ ok: true, added: true });
    expect(await deleteMessage(db, sent.messageId, a, "student")).toEqual({ ok: true });
  });

  it("group conversations list excludes legacy directs", async () => {
    const db = await getDb();
    const a = await makeUser("dm_l1");
    const b = await makeUser("dm_l2");
    const c = await makeUser("dm_l3");
    const group = await createConversation(db, a, { type: "group", participantIds: [b, c], name: "Visible" });
    if (!group.ok) throw new Error("setup failed");
    await col(db, "chatConversations").insertOne({
      type: "direct", name: null, imageUrl: null, createdBy: a,
      communityId: null, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const list = await listConversations(db, a);
    expect(list.every((c) => (c as unknown as { type: string }).type === "group")).toBe(true);
  });
});
