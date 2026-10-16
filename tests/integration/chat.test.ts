import { describe, expect, it, beforeAll, afterEach } from "vitest";
// Isolate this file's data: every integration file uses its own database
// (workers share one memory server, so shared names would flake).
process.env.MONGODB_DB = "dyne_test_chat";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser } from "@/lib/db/users";
import {
  createConversation,
  listConversations,
  sendMessage,
  listMessages,
  addGroupMembers,
  isConversationMember,
} from "@/lib/db/chat";

async function makeUser(username: string) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  return r.userId;
}

describe("chat repository", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("rejects direct conversations (DMs disabled) and supports group messaging with read state", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");

    // Student-to-student DMs are disabled product-wide.
    expect(await createConversation(db, alice, { type: "direct", participantIds: [bob] })).toEqual({
      ok: false, reason: "direct_disabled",
    });
    expect(await createConversation(db, alice, { type: "direct", participantIds: [] })).toEqual({
      ok: false, reason: "direct_disabled",
    });

    // Community/group messaging remains: create a group and message flows.
    // (Students need a real group: creator + 2 others. One-to-one
    // conversations are DMs in disguise and stay disabled.)
    const cara = await makeUser("cara");
    const group = await createConversation(db, alice, { type: "group", participantIds: [bob, cara], name: "Study" });
    if (!group.ok) throw new Error("setup failed");

    const sent = await sendMessage(db, group.conversationId, alice, "Hey Bob");
    expect(sent.ok).toBe(true);

    const bobList = (await listConversations(db, bob)) as Array<Record<string, unknown>>;
    expect(bobList).toHaveLength(1);
    expect(bobList[0].unread).toBe(true);

    const history = await listMessages(db, group.conversationId, bob);
    if (!history.ok) throw new Error("setup failed");
    expect(history.messages).toHaveLength(1);

    const bobListAfter = (await listConversations(db, bob)) as Array<Record<string, unknown>>;
    expect(bobListAfter[0].unread).toBe(false);
  });

  it("blocks non-members from sending, reading, and listing", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const cara = await makeUser("cara");
    const dave = await makeUser("dave");
    const convo = await createConversation(db, alice, { type: "group", participantIds: [bob, dave], name: "G" });
    if (!convo.ok) throw new Error("setup failed");

    expect(await isConversationMember(db, convo.conversationId, cara)).toBe(false);
    expect(await sendMessage(db, convo.conversationId, cara, "intrude")).toEqual({
      ok: false, reason: "forbidden",
    });
    expect(await listMessages(db, convo.conversationId, cara)).toEqual({
      ok: false, reason: "forbidden",
    });
    expect(await listConversations(db, cara)).toHaveLength(0);
  });

  it("supports group conversations with member adds", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const cara = await makeUser("cara");
    const dave = await makeUser("dave");
    const group = await createConversation(db, alice, {
      type: "group", participantIds: [bob, dave], name: "Study",
    });
    if (!group.ok) throw new Error("setup failed");

    // Legacy direct conversation ids reject member adds (group-only).
    expect(await addGroupMembers(db, group.conversationId, cara, [cara])).toEqual({
      ok: false, reason: "forbidden",
    });
    const added = await addGroupMembers(db, group.conversationId, alice, [cara, cara]);
    expect(added).toEqual({ ok: true, added: 1 });
    expect(await isConversationMember(db, group.conversationId, cara)).toBe(true);
  });
});
