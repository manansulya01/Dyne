import { describe, expect, it, beforeAll, afterEach } from "vitest";
process.env.MONGODB_DB = "dyne_test_content";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser } from "@/lib/db/users";
import {
  createBlog, listBlogs, getBlogBySlug, updateBlog, deleteBlog,
  createAnnouncement, listAnnouncements,
  upsertTimetableEntry, listTimetable, clearTimetable,
} from "@/lib/db/content";
import { createCommunity, joinCommunity } from "@/lib/db/communities";
import { createPoll, listPolls, votePoll } from "@/lib/db/polls";

async function makeUser(username: string) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  return r.userId;
}

describe("dyne 2.0 content: blogs, announcements, timetable", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("publishes blogs with drafts hidden by default", async () => {
    const db = await getDb();
    const author = await makeUser("blogger");
    const draft = await createBlog(db, author, { title: "Draft ideas", content: "This is a long enough draft body for validation." });
    expect(draft.ok).toBe(true);
    expect(await listBlogs(db)).toHaveLength(0);
    const pub = await createBlog(db, author, {
      title: "MVA Science Fest", content: "The annual science fest returns with demos and talks.",
      category: "Announcements", isPublished: true, isFeatured: true,
    });
    expect(pub.ok).toBe(true);
    const listed = await listBlogs(db);
    expect(listed).toHaveLength(1);
    const slug = String((listed[0] as Record<string, unknown>).slug);
    const fetched = await getBlogBySlug(db, slug);
    expect(fetched).not.toBeNull();
    // Drafts are invisible unless explicitly included.
    expect(await getBlogBySlug(db, "draft-ideas")).toBeNull();
    const dup = await createBlog(db, author, { title: "MVA Science Fest", content: "Another long enough body for the duplicate test." });
    expect(dup).toEqual({ ok: false, reason: "slug_taken" });
    if (pub.ok) {
      await updateBlog(db, pub.blogId, { isFeatured: false });
      await deleteBlog(db, pub.blogId);
      expect(await listBlogs(db, { includeDrafts: true })).toHaveLength(1);
    }
  });

  it("manages announcements and timetable entries", async () => {
    const db = await getDb();
    const staff = await makeUser("staffer");
    const a = await createAnnouncement(db, staff, { title: "Library hours", body: "Open till 8pm this week.", isPinned: true });
    expect(a.ok).toBe(true);
    expect(await listAnnouncements(db)).toHaveLength(1);

    await upsertTimetableEntry(db, staff, {
      dayOfWeek: 1, periodIndex: 0, startTime: "09:00", endTime: "09:50",
      subject: "Mathematics", room: "B-12", teacher: "Ms. Rao",
    });
    await upsertTimetableEntry(db, staff, {
      dayOfWeek: 1, periodIndex: 1, startTime: "10:00", endTime: "10:50",
      subject: "Physics", room: "B-12",
    });
    const entries = await listTimetable(db);
    expect(entries).toHaveLength(2);
    // Upsert same slot replaces rather than duplicates.
    await upsertTimetableEntry(db, staff, {
      dayOfWeek: 1, periodIndex: 0, startTime: "09:00", endTime: "09:50",
      subject: "Advanced Maths",
    });
    const after = await listTimetable(db);
    expect(after).toHaveLength(2);
    await clearTimetable(db);
    expect(await listTimetable(db)).toHaveLength(0);
  });

  it("runs community polls with one vote per member", async () => {
    const db = await getDb();
    const owner = await makeUser("pollowner");
    const member = await makeUser("pollmember");
    const outsider = await makeUser("polloutsider");
    const c = await createCommunity(db, owner, { name: "Robotics Club", slug: "robotics-polls" });
    if (!c.ok) throw new Error("community setup failed");
    await joinCommunity(db, c.communityId, member);

    const outsiderPoll = await createPoll(db, outsider, { communityId: c.communityId.toHexString(), question: "Hi?", options: ["a", "b"] });
    expect(outsiderPoll).toEqual({ ok: false, reason: "forbidden" });

    const created = await createPoll(db, member, {
      communityId: c.communityId.toHexString(), question: "Which day works?", options: ["Monday", "Friday"],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const pid = created.pollId.toHexString();
    expect((await votePoll(db, pid, outsider, 0)).ok).toBe(false);
    expect(await votePoll(db, pid, member, 0)).toEqual({ ok: true });
    expect(await votePoll(db, pid, owner, 1)).toEqual({ ok: true });
    const polls = await listPolls(db, c.communityId.toHexString(), 10, member);
    expect(polls).toHaveLength(1);
    const p = polls[0] as unknown as Record<string, unknown>;
    expect(p.totalVotes).toBe(2);
    expect(p.myVote).toBe(0);
    // Changing vote moves it (1+1 stays 2 total).
    await votePoll(db, pid, member, 1);
    const again = (await listPolls(db, c.communityId.toHexString(), 10, member))[0] as unknown as Record<string, unknown>;
    expect(again.totalVotes).toBe(2);
    expect(again.myVote).toBe(1);
  });

  it("scopes the following feed to followed users", async () => {
    const db = await getDb();
    const { createPost, listPosts } = await import("@/lib/db/posts");
    const { followUser } = await import("@/lib/db/users");
    const alice = await makeUser("alice2");
    const bob = await makeUser("bob2");
    const carol = await makeUser("carol2");
    await createPost(db, { authorId: bob, content: "Bob's update" });
    await createPost(db, { authorId: carol, content: "Carol's update" });
    await followUser(db, alice, bob);
    const { col: colFn } = await import("@/lib/mongo/collections");
    const follows = await colFn(db, "follows").find({ followerId: alice } as never).toArray();
    expect(follows).toHaveLength(1);
    const feed = await listPosts(db, { authorIds: [bob.toHexString()], limit: 10 });
    expect(feed).toHaveLength(1);
  });
});
