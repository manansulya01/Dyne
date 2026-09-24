import { describe, expect, it, beforeAll, afterEach } from "vitest";
// Isolate this file's data: every integration file uses its own database
// (workers share one memory server, so shared names would flake).
process.env.MONGODB_DB = "dyne_test_mongo";
import { getDb, __resetMongoClientForTests } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { ObjectId } from "mongodb";

describe("mongo client + collections", () => {
  beforeAll(async () => {
    const db = await getDb();
    await ensureIndexes(db);
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("connects to the test database", async () => {
    const db = await getDb();
    expect(db.databaseName).toBe("dyne_test_mongo");
    const ping = await db.command({ ping: 1 });
    expect(ping.ok).toBe(1);
  });

  it("creates all collections via ensureIndexes", async () => {
    const db = await getDb();
    const names = (await db.listCollections().toArray()).map((c) => c.name);
    for (const expected of ["users", "posts", "sessions", "chatMessages", "notifications"]) {
      expect(names).toContain(expected);
    }
  });

  it("enforces unique emails and usernames", async () => {
    const db = await getDb();
    const users = col(db, "users");
    await users.insertOne({
      email: "a@school.test", passwordHash: "x", username: "anna",
      displayName: "Anna", avatarUrl: null, bio: null, role: "student",
      classGrade: null, house: null, interests: [], emailVerifiedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    } as never);
    await expect(
      users.insertOne({
        email: "a@school.test", passwordHash: "x", username: "anna2",
        displayName: "A2", avatarUrl: null, bio: null, role: "student",
        classGrade: null, house: null, interests: [], emailVerifiedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      } as never)
    ).rejects.toThrowError(/duplicate key/i);
    await expect(
      users.insertOne({
        email: "b@school.test", passwordHash: "x", username: "anna",
        displayName: "B", avatarUrl: null, bio: null, role: "student",
        classGrade: null, house: null, interests: [], emailVerifiedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      } as never)
    ).rejects.toThrowError(/duplicate key/i);
  });

  it("supports ObjectId references across collections", async () => {
    const db = await getDb();
    const authorId = new ObjectId();
    const post = await col(db, "posts").insertOne({
      authorId, content: "hello", media: [],
      createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    } as never);
    const found = await col(db, "posts").findOne({ _id: post.insertedId } as never);
    expect(found?.authorId.equals(authorId)).toBe(true);
  });

  it("resets the cached client on demand", async () => {
    __resetMongoClientForTests();
    const db = await getDb();
    expect(db.databaseName).toBe("dyne_test_mongo");
  });
});
