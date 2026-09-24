/** HTTP E2E: profiles, people discovery, follows. */
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
      const res = await fetch(BASE + path, {
        method,
        headers,
        body: opts.body,
        redirect: "manual",
      });
      const setCookies =
        typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
      for (const sc of setCookies) {
        const pair = sc.split(";")[0];
        const idx = pair.indexOf("=");
        if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
      }
      let data = null;
      try {
        data = await res.json();
      } catch {
        /* non-json */
      }
      return { status: res.status, data };
    },
  };
}

const A = makeClient();
const B = makeClient();
await A.signup("anna@school.test", "anna_e2e", "Anna");
await B.signup("ben@school.test", "ben_e2e", "Ben");
const aid = (await A.req("GET", "/api/profile")).data?.profile?.id;
const bid = (await B.req("GET", "/api/profile")).data?.profile?.id;
check("ids resolve", !!aid && !!bid, `${aid} ${bid}`);

// Own profile shape carries counts + flags.
{
  const r = await A.req("GET", "/api/profile");
  const p = r.data?.profile;
  check(
    "own profile shape",
    r.status === 200 && p?.is_own === true && p?.followers_count === 0 && Array.isArray(p?.roles),
    `status=${r.status}`
  );
}

// Other profile by id.
{
  const r = await A.req("GET", `/api/profile?userId=${bid}`);
  check(
    "other profile shape",
    r.status === 200 && r.data?.profile?.is_own === false && r.data?.profile?.is_following === false,
    `status=${r.status}`
  );
}

// Invalid id -> 404, not 500.
{
  const r = await A.req("GET", "/api/profile?userId=not-an-id");
  check("bad profile id 404", r.status === 404, `status=${r.status}`);
}

// Profile edit persists (snake_case in, snake_case out).
{
  const r = await A.req("PATCH", "/api/profile", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: "Anna Updated", bio: "Campus bio", interests: ["music"] }),
  });
  check("profile edit ok", r.status === 200 && r.data?.profile?.display_name === "Anna Updated", `status=${r.status}`);
  const g = await A.req("GET", "/api/profile");
  check("profile edit persists", g.data?.profile?.bio === "Campus bio", "");
}

// People discovery + search + role filter.
{
  const all = await A.req("GET", "/api/people?limit=10");
  check("people list", all.status === 200 && (all.data?.profiles || []).length >= 2, `status=${all.status}`);
  const s = await A.req("GET", "/api/people?search=ben_e2e&limit=10");
  check(
    "people search",
    s.status === 200 && (s.data?.profiles || []).some((p) => p.username === "ben_e2e"),
    `status=${s.status}`
  );
  const f = await A.req("GET", "/api/people?role=teacher&limit=10");
  check(
    "role filter excludes students",
    f.status === 200 && (f.data?.profiles || []).every((p) => p.role !== "student"),
    `status=${f.status}`
  );
}

// Follow lifecycle with counts.
{
  const f = await A.req("POST", "/api/follows", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUserId: bid }),
  });
  check("follow ok", f.status === 200, `status=${f.status} ${JSON.stringify(f.data)?.slice(0, 120)}`);
  const dup = await A.req("POST", "/api/follows", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUserId: bid }),
  });
  check("duplicate follow 400", dup.status === 400, `status=${dup.status}`);
  const self = await A.req("POST", "/api/follows", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUserId: aid }),
  });
  check("self follow 400", self.status === 400, `status=${self.status}`);
  const bp = await B.req("GET", `/api/profile?userId=${bid}`);
  check("follower count 1", bp.data?.profile?.followers_count === 1, JSON.stringify(bp.data?.profile)?.slice(0, 160));
  const ap = await A.req("GET", `/api/profile?userId=${aid}`);
  check("following count 1", ap.data?.profile?.following_count === 1, "");
  const followers = await A.req("GET", `/api/follows?userId=${bid}&type=followers`);
  check("followers list", followers.status === 200 && followers.data?.profiles?.length === 1, `status=${followers.status}`);
  const u = await A.req("DELETE", "/api/follows", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUserId: bid }),
  });
  check("unfollow ok", u.status === 200, `status=${u.status}`);
  const bp2 = await B.req("GET", `/api/profile?userId=${bid}`);
  check("follower count back to 0", bp2.data?.profile?.followers_count === 0, "");
}

// Notifications: follow fan-out landed for B.
{
  const f = await A.req("POST", "/api/follows", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUserId: bid }),
  });
  check("refollow ok", f.status === 200, `status=${f.status}`);
  const n = await B.req("GET", "/api/notifications?limit=10");
  check(
    "follow notification present",
    n.status === 200 && (n.data?.notifications || []).some((x) => x.type === "follow"),
    `status=${n.status}`
  );
  check("unread count", (n.data?.unreadCount ?? 0) >= 1, `unread=${n.data?.unreadCount}`);
  const first = n.data.notifications.find((x) => !x.read_at);
  if (first) {
    const mr = await B.req("PATCH", "/api/notifications", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: first.id }),
    });
    check("mark read ok", mr.status === 200, `status=${mr.status}`);
  } else {
    check("mark read ok", false, "no unread notification");
  }
}

console.log(`\nPEOPLE-E2E: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
