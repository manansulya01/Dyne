import { describe, expect, it, beforeAll, afterEach } from "vitest";
// Isolate this file's data: every integration file uses its own database
// (workers share one memory server, so shared names would flake).
process.env.MONGODB_DB = "dyne_test_sessions";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames, type UserDoc } from "@/lib/mongo/collections";
import { hashPassword } from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  destroyAllUserSessions,
  resolveUserByToken,
} from "@/lib/auth/session";

async function makeUser(username: string) {
  const db = await getDb();
  const now = new Date();
  const res = await col<UserDoc>(db, "users").insertOne({
    email: `${username}@school.test`,
    passwordHash: await hashPassword("Password-123"),
    username,
    displayName: username,
    avatarUrl: null,
    bio: null,
    role: "student",
    classGrade: null,
    house: null,
    interests: [],
    emailVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
  } as never);
  return res.insertedId;
}

describe("sessions", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("creates, resolves, and destroys sessions; only hashes are stored", async () => {
    const db = await getDb();
    const userId = await makeUser("sara");
    const { token, expiresAt } = await createSession(db, userId, "test-agent");
    expect(token.length).toBeGreaterThan(30);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const stored = await col(db, "sessions").find({}).toArray();
    expect(stored).toHaveLength(1);
    expect(String(stored[0].tokenHash)).not.toContain(token.slice(0, 12));
    expect(stored[0].userId.equals(userId)).toBe(true);

    const resolved = await resolveUserByToken(db, token);
    expect(resolved?.id).toBe(userId.toHexString());
    expect(resolved?.username).toBe("sara");
    expect(resolved?.role).toBe("student");

    await destroySession(db, token);
    expect(await resolveUserByToken(db, token)).toBeNull();
  });

  it("rejects unknown, short, and expired tokens", async () => {
    const db = await getDb();
    const userId = await makeUser("tom");
    expect(await resolveUserByToken(db, "nope-not-a-token-at-all")).toBeNull();
    expect(await resolveUserByToken(db, "short")).toBeNull();

    const { token } = await createSession(db, userId);
    await col(db, "sessions").updateOne(
      { tokenHash: { $exists: true } } as never,
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );
    expect(await resolveUserByToken(db, token)).toBeNull();
  });

  it("destroys all sessions for a user (logout everywhere)", async () => {
    const db = await getDb();
    const userId = await makeUser("leo");
    const a = await createSession(db, userId);
    const b = await createSession(db, userId);
    expect(await resolveUserByToken(db, a.token)).not.toBeNull();
    await destroyAllUserSessions(db, userId);
    expect(await resolveUserByToken(db, a.token)).toBeNull();
    expect(await resolveUserByToken(db, b.token)).toBeNull();
  });

  it("does not resolve sessions for deleted users", async () => {
    const db = await getDb();
    const userId = new ObjectId();
    const { token } = await createSession(db, userId);
    expect(await resolveUserByToken(db, token)).toBeNull();
  });
});
