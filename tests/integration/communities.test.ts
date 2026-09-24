import { describe, expect, it, beforeAll, afterEach } from "vitest";
// Isolate this file's data: every integration file uses its own database
// (workers share one memory server, so shared names would flake).
process.env.MONGODB_DB = "dyne_test_communities";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser } from "@/lib/db/users";
import {
  createCommunity,
  joinCommunity,
  leaveCommunity,
  listMembers,
  memberRole,
  setMemberRole,
  createCommunityPost,
  listCommunityPosts,
  updateCommunity,
} from "@/lib/db/communities";

async function makeUser(username: string) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  return r.userId;
}

describe("communities repository", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("creates with owner membership and validates input", async () => {
    const db = await getDb();
    const owner = await makeUser("owner");
    expect(await createCommunity(db, owner, { name: "x", slug: "ok-slug" })).toEqual({
      ok: false, reason: "bad_name",
    });
    expect(await createCommunity(db, owner, { name: "Gamers", slug: "BAD SLUG" })).toEqual({
      ok: false, reason: "bad_slug",
    });
    const created = await createCommunity(db, owner, {
      name: "Gamers", slug: "gamers", description: "play",
    });
    if (!created.ok) throw new Error("setup failed");
    expect(await memberRole(db, created.communityId, owner)).toBe("owner");
    const dup = await createCommunity(db, owner, { name: "Other", slug: "gamers" });
    expect(dup).toEqual({ ok: false, reason: "slug_taken" });
  });

  it("joins/leaves with private + owner guards", async () => {
    const db = await getDb();
    const owner = await makeUser("owner");
    const bob = await makeUser("bob");
    const pub = await createCommunity(db, owner, { name: "Open", slug: "open" });
    const priv = await createCommunity(db, owner, { name: "Secret", slug: "secret", isPrivate: true });
    if (!pub.ok || !priv.ok) throw new Error("setup failed");

    expect((await joinCommunity(db, pub.communityId, bob)).ok).toBe(true);
    expect(await joinCommunity(db, priv.communityId, bob)).toEqual({ ok: false, reason: "private" });
    expect((await leaveCommunity(db, pub.communityId, bob, bob)).ok).toBe(true);
    expect(await leaveCommunity(db, pub.communityId, owner, owner)).toEqual({
      ok: false, reason: "owner_cannot_leave",
    });
    // Non-member cannot kick others.
    expect(await leaveCommunity(db, pub.communityId, owner, bob)).toEqual({
      ok: false, reason: "forbidden",
    });
  });

  it("manages moderator roles with owner/moderator rules", async () => {
    const db = await getDb();
    const owner = await makeUser("owner");
    const bob = await makeUser("bob");
    const cara = await makeUser("cara");
    const created = await createCommunity(db, owner, { name: "Club", slug: "club" });
    if (!created.ok) throw new Error("setup failed");
    await joinCommunity(db, created.communityId, bob);
    await joinCommunity(db, created.communityId, cara);

    // Strangers cannot touch roles.
    expect(await setMemberRole(db, created.communityId, bob, cara, "member")).toEqual({
      ok: false, reason: "forbidden",
    });
    // Owner promotes Bob to moderator.
    expect((await setMemberRole(db, created.communityId, bob, owner, "moderator")).ok).toBe(true);
    expect(await memberRole(db, created.communityId, bob)).toBe("moderator");
    // Moderators cannot promote others to moderator...
    expect(await setMemberRole(db, created.communityId, cara, bob, "moderator")).toEqual({
      ok: false, reason: "owner_only_promote",
    });
    // ...but can keep members as members.
    expect((await setMemberRole(db, created.communityId, cara, bob, "member")).ok).toBe(true);
    // Moderators cannot demote fellow moderators.
    const dave = await makeUser("dave");
    await joinCommunity(db, created.communityId, dave);
    await setMemberRole(db, created.communityId, dave, owner, "moderator");
    expect(await setMemberRole(db, created.communityId, dave, bob, "member")).toEqual({
      ok: false, reason: "owner_only_demote",
    });
    // Owner's own role is untouchable.
    expect(await setMemberRole(db, created.communityId, owner, owner, "member")).toEqual({
      ok: false, reason: "cannot_change_owner",
    });

    const members = await listMembers(db, created.communityId);
    expect(members).toHaveLength(4);
  });

  it("posts within membership rules and edits with permissions", async () => {
    const db = await getDb();
    const owner = await makeUser("owner");
    const bob = await makeUser("bob");
    const priv = await createCommunity(db, owner, { name: "Secret", slug: "secret", isPrivate: true });
    const pub = await createCommunity(db, owner, { name: "Open", slug: "open-pub" });
    if (!priv.ok || !pub.ok) throw new Error("setup failed");

    // Strangers cannot post in private communities.
    expect(await createCommunityPost(db, priv.communityId, bob, "hi")).toEqual({
      ok: false, reason: "forbidden",
    });
    // Owner can post in their private community.
    expect((await createCommunityPost(db, priv.communityId, owner, "welcome")).ok).toBe(true);
    // Joined members can post in public communities.
    await joinCommunity(db, pub.communityId, bob);
    expect((await createCommunityPost(db, pub.communityId, bob, "hello all")).ok).toBe(true);
    expect(await listCommunityPosts(db, pub.communityId)).toHaveLength(1);

    expect(await updateCommunity(db, priv.communityId, bob, { description: "hacked" })).toEqual({
      ok: false, reason: "forbidden",
    });
    expect((await updateCommunity(db, priv.communityId, owner, { description: "new" })).ok).toBe(true);
  });
});
