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

  it("creates direct conversations once and messages flow with read state", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");

    expect(await createConversation(db, alice, { type: "direct", participantIds: [] })).toEqual({
      ok: false, reason: "direct_needs_one",
    });
    const first = await createConversation(db, alice, { type: "direct", participantIds: [bob] });
    if (!first.ok) throw new Error("setup failed");
    const second = await createConversation(db, bob, { type: "direct", participantIds: [alice] });
    expect(second).toMatchObject({ ok: true, reused: true });
    if (!second.ok) throw new Error("setup failed");
    expect(second.conversationId.equals(first.conversationId)).toBe(true);

    const sent = await sendMessage(db, first.conversationId, alice, "Hey Bob");
    expect(sent.ok).toBe(true);

    const bobList = (await listConversations(db, bob)) as Array<Record<string, unknown>>;
    expect(bobList).toHaveLength(1);
    expect(bobList[0].unread).toBe(true);

    const history = await listMessages(db, first.conversationId, bob);
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
    const convo = await createConversation(db, alice, { type: "direct", participantIds: [bob] });
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
    const group = await createConversation(db, alice, {
      type: "group", participantIds: [bob], name: "Study",
    });
    if (!group.ok) throw new Error("setup failed");

    // Direct conversations reject member adds.
    const dm = await createConversation(db, alice, { type: "direct", participantIds: [cara] });
    if (!dm.ok) throw new Error("setup failed");
    expect(await addGroupMembers(db, dm.conversationId, alice, [bob])).toEqual({
      ok: false, reason: "direct_only",
    });

    expect(await addGroupMembers(db, group.conversationId, cara, [cara])).toEqual({
      ok: false, reason: "forbidden",
    });
    const added = await addGroupMembers(db, group.conversationId, alice, [cara, cara]);
    expect(added).toEqual({ ok: true, added: 1 });
    expect(await isConversationMember(db, group.conversationId, cara)).toBe(true);
  });
});
