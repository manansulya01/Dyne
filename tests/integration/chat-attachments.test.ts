import { describe, expect, it, beforeAll, afterEach } from "vitest";
// Isolate this file's data: every integration file uses its own database
// (workers share one memory server, so shared names would flake).
process.env.MONGODB_DB = "dyne_test_chat_attachments";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser } from "@/lib/db/users";
import { createConversation, sendMessage, listMessages } from "@/lib/db/chat";
import { messageCreateSchema } from "@/lib/validation";

async function makeUser(username: string) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  return r.userId;
}

describe("chat message attachments", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("persists attachment-only messages and returns them in history", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const cara = await makeUser("cara");
    const group = await createConversation(db, alice, { type: "group", participantIds: [bob, cara], name: "G" });
    if (!group.ok) throw new Error("setup failed");

    // Attachment-only message (no text) is valid.
    const sent = await sendMessage(db, group.conversationId, alice, "   ", [
      { url: "/api/files/message-attachments/alice/abc.pdf", mime: "application/pdf", fileName: "notes.pdf", size: 1234 },
    ]);
    expect(sent.ok).toBe(true);

    const history = await listMessages(db, group.conversationId, bob);
    if (!history.ok) throw new Error("setup failed");
    expect(history.messages).toHaveLength(1);
    const row = history.messages[0] as unknown as Record<string, unknown>;
    expect(row.content).toBeNull();
    expect(row.attachments).toHaveLength(1);

    // Empty text with no attachments is still rejected.
    expect(await sendMessage(db, group.conversationId, alice, "   ", [])).toEqual({
      ok: false, reason: "empty",
    });
  });

  it("validates attachment claim input (max 5 ids, valid content)", async () => {
    const hex = "a".repeat(24);
    // Content is optional now (attachment-only messages allowed).
    expect(messageCreateSchema.safeParse({ conversationId: hex }).success).toBe(true);
    expect(
      messageCreateSchema.safeParse({ conversationId: hex, content: "", attachmentIds: [hex] }).success
    ).toBe(true);
    // More than 5 claims rejected; overlong content rejected.
    expect(
      messageCreateSchema.safeParse({ conversationId: hex, attachmentIds: [hex, hex, hex, hex, hex, hex] }).success
    ).toBe(false);
    expect(
      messageCreateSchema.safeParse({ conversationId: hex, content: "x".repeat(10001) }).success
    ).toBe(false);
  });
});
