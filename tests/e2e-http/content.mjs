/** HTTP E2E: Dyne 2.0 content — blogs, announcements, timetable, polls, preferences, schedule. */
import { execFileSync } from "node:child_process";

const BASE = process.env.APP_BASE || "http://127.0.0.1:3117";
let pass = 0;
let fail = 0;
function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name} ${extra}`);
  }
}
process.on("uncaughtException", (e) => {
  console.log("CRASH: " + (e instanceof Error ? e.message : String(e)));
  process.exit(2);
});
function json(body) {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
function makeClient() {
  const jar = {};
  return {
    async signup(email, username, dn) {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("password", "Password-123");
      fd.set("confirmPassword", "Password-123");
      fd.set("username", username);
      fd.set("displayName", dn);
      return this.req("POST", "/api/auth/signup", { body: fd });
    },
    async req(method, path, opts = {}) {
      const headers = { ...(opts.headers || {}) };
      const cookies = Object.entries(jar)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
      if (cookies) headers.Cookie = cookies;
      const res = await fetch(BASE + path, { method, headers, body: opts.body });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        for (const part of setCookie.split(",")) {
          const m = part.trim().match(/^([^=]+)=([^;]*)/);
          if (m) jar[m[1]] = m[2];
        }
      }
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      return { status: res.status, data };
    },
  };
}

const A = makeClient(); // will become admin/teacher
const B = makeClient(); // student

await A.signup("contenta@school.test", "contenta_e2e", "Content A");
await B.signup("contentb@school.test", "contentb_e2e", "Content B");
execFileSync(process.execPath, ["scripts/promote.mjs", "contenta@school.test", "teacher"], { stdio: "pipe" });

// Blogs: student cannot publish, teacher can; public list works.
{
  const denied = await B.req("POST", "/api/blogs", json({ title: "Sneaky post", content: "This body is long enough to pass validation rules here." }));
  check("student blog publish 403", denied.status === 403, `status=${denied.status}`);
  const created = await A.req(
    "POST",
    "/api/blogs",
    json({ title: "MVA Science Fest", category: "Announcements", content: "The annual science fest returns with demos, talks, and workshops.", isPublished: true, isFeatured: true })
  );
  check("teacher blog publish 201", created.status === 201, `status=${created.status}`);
  const list = await B.req("GET", "/api/blogs?limit=10");
  check("blog list visible", list.status === 200 && (list.data?.blogs || []).length >= 1, `status=${list.status}`);
  const slug = list.data.blogs[0].slug;
  const detail = await B.req("GET", `/api/blogs/${slug}`);
  check("blog detail + related shape", detail.status === 200 && detail.data?.blog?.title === "MVA Science Fest" && Array.isArray(detail.data?.related), `status=${detail.status}`);
  const search = await B.req("GET", "/api/search?q=Science");
  check("search includes blogs", search.status === 200 && Array.isArray(search.data?.blogs), `status=${search.status}`);
}

// Announcements + timetable + schedule.
{
  const denied = await B.req("POST", "/api/announcements", json({ title: "Hi", body: "Hello campus" }));
  check("student announcement 403", denied.status === 403, `status=${denied.status}`);
  const ann = await A.req("POST", "/api/announcements", json({ title: "Library hours extended", body: "Open till 8pm this week.", isPinned: true }));
  check("announcement created", ann.status === 201, `status=${ann.status}`);
  const annList = await B.req("GET", "/api/announcements?limit=10");
  check("announcement list", annList.status === 200 && (annList.data?.announcements || []).length >= 1, `status=${annList.status}`);

  const bad = await B.req("POST", "/api/timetable", json({ dayOfWeek: 1, periodIndex: 0, startTime: "09:00", endTime: "09:50", subject: "Maths" }));
  check("student timetable 403", bad.status === 403, `status=${bad.status}`);
  const tt = await A.req("POST", "/api/timetable", json({ dayOfWeek: 1, periodIndex: 0, startTime: "09:00", endTime: "09:50", subject: "Mathematics", room: "B-12", teacher: "Ms. Rao" }));
  check("timetable entry created", tt.status === 201, `status=${tt.status}`);
  const ttList = await B.req("GET", "/api/timetable");
  check("timetable list", ttList.status === 200 && (ttList.data?.entries || []).length >= 1, `status=${ttList.status}`);
  const sched = await B.req("GET", "/api/schedule?limit=10");
  check(
    "schedule aggregates",
    sched.status === 200 && Array.isArray(sched.data?.events) && Array.isArray(sched.data?.announcements) && Array.isArray(sched.data?.timetable),
    `status=${sched.status}`
  );
}

// Polls: member-only creation and voting.
{
  const c = await B.req("POST", "/api/communities", json({ name: "Poll Testers", slug: "poll-testers-e2e", description: "polls" }));
  check("community created", (c.status === 200 || c.status === 201) && !!c.data?.community?.id, `status=${c.status}`);
  const cid = c.data.community.id;
  const denied = await A.req("POST", "/api/polls", json({ communityId: cid, question: "Outsider?", options: ["a", "b"] }));
  check("outsider poll 403", denied.status === 403, `status=${denied.status}`);
  const p = await B.req("POST", "/api/polls", json({ communityId: cid, question: "Which day works?", options: ["Monday", "Friday"] }));
  check("member poll created", p.status === 201 && !!p.data?.id, `status=${p.status}`);
  const pid = p.data.id;
  const v1 = await B.req("POST", `/api/polls/${pid}/vote`, json({ optionIndex: 0 }));
  check("member vote ok", v1.status === 200, `status=${v1.status}`);
  const v2 = await A.req("POST", `/api/polls/${pid}/vote`, json({ optionIndex: 0 }));
  check("outsider vote 403", v2.status === 403, `status=${v2.status}`);
  const list = await B.req("GET", `/api/polls?communityId=${cid}`);
  check("poll counts shape", list.status === 200 && (list.data?.polls || [])[0]?.totalVotes === 1, `status=${list.status}`);
}

// Preferences + following feed + profile cover.
{
  const prefs = await B.req("PATCH", "/api/preferences", json({ profileVisibility: "private", notifyEvents: false }));
  check("preferences patch", prefs.status === 200 && prefs.data?.preferences?.profileVisibility === "private", `status=${prefs.status}`);
  const get = await B.req("GET", "/api/preferences");
  check("preferences persist", get.status === 200 && get.data?.preferences?.notifyEvents === false, `status=${get.status}`);

  const me = await B.req("GET", "/api/profile");
  const myId = me.data?.profile?.id;
  const people = await A.req("GET", "/api/people?search=contentb_e2e&limit=5");
  const target = (people.data?.profiles || [])[0];
  const f = await A.req("POST", "/api/follows", json({ targetUserId: target.id }));
  check("follow for feed filter", f.status === 200, `status=${f.status}`);
  const post = new FormData();
  post.set("content", "hello followers e2e");
  const created = await B.req("POST", "/api/posts", { body: post });
  check("post created", created.status === 200 || created.status === 201, `status=${created.status}`);
  const feed = await A.req("GET", "/api/posts?filter=following&limit=10");
  check("following feed scoped", feed.status === 200 && (feed.data?.posts || []).every((x) => x.author_id === target.id), `status=${feed.status}`);

  const cover = await B.req("PATCH", "/api/profile", json({ coverImageUrl: "https://example.com/cover.jpg", accent: "aurora" }));
  check("profile cover+accent saved", cover.status === 200, `status=${cover.status}`);
  const mine2 = await B.req("GET", `/api/profile?userId=${myId}`);
  check("profile cover persists", mine2.data?.profile?.cover_image_url === "https://example.com/cover.jpg", JSON.stringify(mine2.data?.profile || {}).slice(0, 120));
}

// Campus write paths (teacher) + building detail.
{
  const b = await A.req("POST", "/api/campus/buildings", json({ name: "E2E Library Hall", description: "Study space" }));
  check("building created", b.status === 201 && !!b.data?.id, `status=${b.status}`);
  const denied = await B.req("POST", "/api/campus/buildings", json({ name: "Nope", description: "x" }));
  check("student building 403", denied.status === 403, `status=${denied.status}`);
  if (b.data?.id) {
    const d = await B.req("GET", `/api/campus/buildings/${b.data.id}`);
    check("building detail + events", d.status === 200 && !!d.data?.building && Array.isArray(d.data?.events), `status=${d.status}`);
  }
  const cl = await A.req("POST", "/api/campus/clubs", json({ name: "E2E Robotics", description: "Bots", category: "Tech" }));
  check("club created", cl.status === 201, `status=${cl.status}`);
}

console.log(`\nCONTENT-E2E: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
