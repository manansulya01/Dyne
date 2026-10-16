import { describe, expect, it, beforeAll, afterEach } from "vitest";
process.env.MONGODB_DB = "dyne_test_channels";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser, setUserRole } from "@/lib/db/users";
import {
  createCommunity,
  joinCommunity,
  setMemberRole,
  listCommunityPosts,
  createCommunityPost,
  setPostPinned,
  updateCommunity,
} from "@/lib/db/communities";
import { createChannel, listChannels, renameChannel, deleteChannel } from "@/lib/db/channels";
import { createConversation } from "@/lib/db/chat";

async function makeUser(username: string, role: "student" | "admin" = "student") {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  if (role !== "student") await setUserRole(db, r.userId, role);
  return r.userId;
}

describe("community channels", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("auto-creates #general and lists channels for members", async () => {
    const db = await getDb();
    const owner = await makeUser("ch_o1");
    const member = await makeUser("ch_m1");
    const outsider = await makeUser("ch_x1");
    const c = await createCommunity(db, owner, { name: "Gamers", slug: "gamers-ch", isPrivate: false });
    if (!c.ok) throw new Error("setup failed");
    expect((await joinCommunity(db, c.communityId, member)).ok).toBe(true);
    const listed = await listChannels(db, c.communityId, member);
    if (!listed.ok) throw new Error("setup failed");
    expect(listed.channels.map((x) => (x as unknown as Record<string, unknown>).name)).toContain("general");
    expect(await listChannels(db, c.communityId, outsider)).toMatchObject({ ok: true }); // public community
  });

  it("private communities hide channels from outsiders; members only create with rights", async () => {
    const db = await getDb();
    const owner = await makeUser("ch_o2");
    const member = await makeUser("ch_m2");
    const outsider = await makeUser("ch_x2");
    const c = await createCommunity(db, owner, { name: "Secret", slug: "secret-ch", isPrivate: true });
    if (!c.ok) throw new Error("setup failed");
    expect(await listChannels(db, c.communityId, outsider)).toEqual({ ok: false, reason: "forbidden" });
    expect((await joinCommunity(db, c.communityId, member)).ok).toBe(false); // private
    // Owner invites by direct membership insert path? Use member add via joinCommunity owner-bypass is absent;
    // instead verify plain members cannot create channels.
    const pub = await createCommunity(db, owner, { name: "Open", slug: "open-ch", isPrivate: false });
    if (!pub.ok) throw new Error("setup failed");
    expect((await joinCommunity(db, pub.communityId, member)).ok).toBe(true);
    expect(await createChannel(db, pub.communityId, member, { name: "nope" })).toEqual({
      ok: false, reason: "forbidden",
    });
    const ok = await createChannel(db, pub.communityId, owner, { name: "announcements", topic: "News" });
    expect(ok.ok).toBe(true);
    const dup = await createChannel(db, pub.communityId, owner, { name: "announcements" });
    expect(dup).toEqual({ ok: false, reason: "name_taken" });
    expect(await createChannel(db, pub.communityId, owner, { name: "x" })).toEqual({
      ok: false, reason: "bad_name",
    });
  });

  it("channel-scoped conversations verify membership and channel linkage", async () => {
    const db = await getDb();
    const owner = await makeUser("ch_o3");
    const member = await makeUser("ch_m3");
    const stranger = await makeUser("ch_s3");
    const c = await createCommunity(db, owner, { name: "Study", slug: "study-ch", isPrivate: false });
    if (!c.ok) throw new Error("setup failed");
    expect((await joinCommunity(db, c.communityId, member)).ok).toBe(true);
    const ch = await createChannel(db, c.communityId, owner, { name: "math" });
    if (!ch.ok) throw new Error("setup failed");
    const convo = await createConversation(db, member, {
      type: "group", participantIds: [owner], name: "Math help", channelId: ch.channelId,
    });
    if (!convo.ok) throw new Error(`setup failed: ${JSON.stringify(convo)}`);
    expect(await createConversation(db, stranger, {
      type: "group", participantIds: [owner], name: "X", channelId: ch.channelId,
    })).toEqual({ ok: false, reason: "not_community_member" });
    const other = await createCommunity(db, owner, { name: "Other", slug: "other-ch", isPrivate: false });
    if (!other.ok) throw new Error("setup failed");
    expect((await joinCommunity(db, other.communityId, member)).ok).toBe(true);
    expect(await createConversation(db, member, {
      type: "group", participantIds: [owner], name: "Y",
      communityId: other.communityId, channelId: ch.channelId,
    })).toEqual({ ok: false, reason: "channel_mismatch" });
  });

  it("rename/delete enforce owner-only delete and last-channel guard", async () => {
    const db = await getDb();
    const owner = await makeUser("ch_o4");
    const c = await createCommunity(db, owner, { name: "Club", slug: "club-ch", isPrivate: false });
    if (!c.ok) throw new Error("setup failed");
    const listed = await listChannels(db, c.communityId, owner);
    if (!listed.ok || listed.channels.length === 0) throw new Error("setup failed");
    const general = listed.channels[0] as unknown as { id: string };
    expect(await deleteChannel(db, general.id, owner)).toEqual({ ok: false, reason: "last_channel" });
    const extra = await createChannel(db, c.communityId, owner, { name: "extra" });
    if (!extra.ok) throw new Error("setup failed");
    expect((await renameChannel(db, extra.channelId, owner, { name: "general" })).ok).toBe(false);
    expect((await renameChannel(db, extra.channelId, owner, { name: "renamed" })).ok).toBe(true);
    expect((await deleteChannel(db, extra.channelId, owner)).ok).toBe(true);
  });
});

describe("community admin role, rules, pinned posts", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("enforces owner > admin > moderator > member hierarchy", async () => {
    const db = await getDb();
    const owner = await makeUser("hr_o");
    const a = await makeUser("hr_a");
    const m = await makeUser("hr_m");
    const s = await makeUser("hr_s");
    const c = await createCommunity(db, owner, { name: "Hub", slug: "h-ch", isPrivate: false });
    if (!c.ok) throw new Error("setup failed");
    for (const u of [a, m, s]) expect((await joinCommunity(db, c.communityId, u)).ok).toBe(true);
    // Owner grants admin; admin grants moderator; moderator cannot change roles.
    expect((await setMemberRole(db, c.communityId, a, owner, "admin")).ok).toBe(true);
    expect((await setMemberRole(db, c.communityId, m, a, "moderator")).ok).toBe(true);
    expect(await setMemberRole(db, c.communityId, s, m, "moderator")).toEqual({
      ok: false, reason: "forbidden",
    });
    expect(await setMemberRole(db, c.communityId, m, a, "admin")).toEqual({
      ok: false, reason: "owner_only_admin",
    });
    expect(await setMemberRole(db, c.communityId, a, m, "member")).toEqual({
      ok: false, reason: "owner_only_admin",
    });
    expect((await setMemberRole(db, c.communityId, m, a, "member")).ok).toBe(true);
  });

  it("stores rules and floats pinned discussions first", async () => {
    const db = await getDb();
    const owner = await makeUser("rp_o");
    const c = await createCommunity(db, owner, { name: "Rules", slug: "r-ch", isPrivate: false });
    if (!c.ok) throw new Error("setup failed");
    expect((await updateCommunity(db, c.communityId, owner, { rules: ["Be kind", "No spam"] })).ok).toBe(true);
    const p1 = await createCommunityPost(db, c.communityId, owner, "first post");
    const p2 = await createCommunityPost(db, c.communityId, owner, "second post");
    if (!p1.ok || !p2.ok) throw new Error("setup failed");
    expect((await setPostPinned(db, p1.postId, owner, true)).ok).toBe(true);
    const list = await listCommunityPosts(db, c.communityId, 20);
    expect(String((list[0] as unknown as Record<string, unknown>).id)).toBe(p1.postId.toHexString());
    expect((list[0] as unknown as Record<string, unknown>).isPinned).toBe(true);
  });

  it("ordinary members cannot pin or set rules", async () => {
    const db = await getDb();
    const owner = await makeUser("rp_o2");
    const member = await makeUser("rp_m2");
    const c = await createCommunity(db, owner, { name: "RulesTwo", slug: "r2-ch", isPrivate: false });
    if (!c.ok) throw new Error("setup failed");
    expect((await joinCommunity(db, c.communityId, member)).ok).toBe(true);
    const p = await createCommunityPost(db, c.communityId, member, "hello");
    if (!p.ok) throw new Error("setup failed");
    expect(await setPostPinned(db, p.postId, member, true)).toEqual({ ok: false, reason: "forbidden" });
    expect(await updateCommunity(db, c.communityId, member, { rules: ["x"] })).toEqual({
      ok: false, reason: "forbidden",
    });
  });
});
