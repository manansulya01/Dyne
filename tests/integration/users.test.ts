import { describe, expect, it, beforeAll, afterEach } from "vitest";
// Isolate this file's data: every integration file uses its own database
// (workers share one memory server, so shared names would flake).
process.env.MONGODB_DB = "dyne_test_users";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import {
  createUser,
  findUserByEmail,
  followUser,
  unfollowUser,
  followCounts,
  isFollowing,
  setUserRole,
  updateOwnProfile,
} from "@/lib/db/users";
import { toProfileJSON } from "@/lib/db/contracts";

describe("users repository", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("creates users and classifies conflicts without throwing", async () => {
    const db = await getDb();
    const a = await createUser(db, {
      email: "A@school.test", password: "Password-1",
      username: "anna", displayName: "Anna",
    });
    expect(a.ok).toBe(true);
    expect((await findUserByEmail(db, "a@school.test"))?.username).toBe("anna");

    const dupEmail = await createUser(db, {
      email: "a@school.test", password: "Password-1",
      username: "other", displayName: "Other",
    });
    expect(dupEmail).toEqual({ ok: false, reason: "email_taken" });

    const dupUser = await createUser(db, {
      email: "other@school.test", password: "Password-1",
      username: "anna", displayName: "Other",
    });
    expect(dupUser).toEqual({ ok: false, reason: "username_taken" });
  });

  it("updates own profile fields and hides secrets publicly", async () => {
    const db = await getDb();
    const created = await createUser(db, {
      email: "b@school.test", password: "Password-1",
      username: "ben", displayName: "Ben",
    });
    if (!created.ok) throw new Error("setup failed");
    const updated = await updateOwnProfile(db, created.userId, {
      bio: "Hello campus",
      interests: ["robotics"],
    });
    expect(updated?.bio).toBe("Hello campus");
    const pub = toProfileJSON(updated as unknown as Record<string, unknown>);
    expect(pub).not.toHaveProperty("passwordHash");
    expect(pub).not.toHaveProperty("email");
    expect(pub.bio).toBe("Hello campus");
  });

  it("manages roles server-side", async () => {
    const db = await getDb();
    const created = await createUser(db, {
      email: "c@school.test", password: "Password-1",
      username: "cara", displayName: "Cara",
    });
    if (!created.ok) throw new Error("setup failed");
    expect(await setUserRole(db, created.userId, "teacher")).toBe(true);
    expect((await findUserByEmail(db, "c@school.test"))?.role).toBe("teacher");
  });

  it("follows with self/duplicate/missing guards and counts", async () => {
    const db = await getDb();
    const a = await createUser(db, { email: "d@school.test", password: "Password-1", username: "dan", displayName: "Dan" });
    const b = await createUser(db, { email: "e@school.test", password: "Password-1", username: "erin", displayName: "Erin" });
    if (!a.ok || !b.ok) throw new Error("setup failed");

    expect(await followUser(db, a.userId, a.userId)).toEqual({ ok: false, reason: "self" });
    expect(await followUser(db, a.userId, "507f1f77bcf86cd799439011")).toEqual({ ok: false, reason: "not_found" });
    expect((await followUser(db, a.userId, b.userId)).ok).toBe(true);
    expect(await followUser(db, a.userId, b.userId)).toEqual({ ok: false, reason: "already" });
    expect(await isFollowing(db, a.userId, b.userId)).toBe(true);
    expect(await followCounts(db, b.userId)).toEqual({ followers: 1, following: 0 });
    expect((await unfollowUser(db, a.userId, b.userId)).ok).toBe(true);
    expect(await isFollowing(db, a.userId, b.userId)).toBe(false);
  });
});
