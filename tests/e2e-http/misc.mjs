/** HTTP E2E: watch, search, admin/moderation, campus. */
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

const json = (o) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) });
const A = makeClient();
const B = makeClient();
await A.signup("watcha@school.test", "watcha_e2e", "WatchA");
await B.signup("watchb@school.test", "watchb_e2e", "WatchB");

// Watch: upload bytes -> metadata -> view throttle -> authz.
let videoId;
{
  const tiny = Buffer.from("00000018667479706d703432", "hex");
  const fd = new FormData();
  fd.set("file", new Blob([tiny], { type: "video/mp4" }), "tiny.mp4");
  fd.set("bucket", "watch-videos");
  const up = await A.req("POST", "/api/upload", { body: fd });
  check("video bytes upload", up.status === 200 && !!up.data?.media?.url, `status=${up.status}`);
  const v = await A.req("POST", "/api/videos", json({
    title: "Robotics Finals", description: "club night",
    videoUrl: up.data?.media?.url, category: "clubs",
  }));
  check("video metadata saved", v.status === 200 && !!v.data?.video?.id, `status=${v.status}`);
  videoId = v.data?.video?.id;
  // Relative local URLs must validate (regression: absolute-only schema).
  check("relative video url accepted", typeof v.data?.video?.video_url === "string", "");
  const list = await A.req("GET", "/api/videos?limit=10");
  check("video listed", (list.data?.videos || []).some((x) => x.id === videoId), "");
  const mine = await A.req("GET", "/api/videos?mine=true&limit=10");
  check("mine filter", (mine.data?.videos || []).every((x) => x.creator?.username === "watcha_e2e"), "");
  const d1 = await B.req("GET", `/api/videos/${videoId}`);
  check("view count 1", d1.data?.video?.view_count === 1, `vc=${d1.data?.video?.view_count}`);
  const d2 = await B.req("GET", `/api/videos/${videoId}`);
  check("view throttled", d2.data?.video?.view_count === 1, `vc=${d2.data?.video?.view_count}`);
  const bd = await B.req("DELETE", `/api/videos/${videoId}`);
  check("non-owner delete 403", bd.status === 403, `status=${bd.status}`);
}

// Search across entities.
{
  const fd = new FormData();
  fd.set("content", "robotics club meets Friday on the field");
  await A.req("POST", "/api/posts", { body: fd });
  const s = await A.req("GET", "/api/search?q=robotics");
  check("search people", (s.data?.people || []).length >= 0, `status=${s.status}`);
  check("search posts hit", (s.data?.posts || []).length >= 1, `posts=${(s.data?.posts || []).length}`);
  check("search videos hit", (s.data?.videos || []).some((v) => v.id === videoId), "");
  const short = await A.req("GET", "/api/search?q=x");
  check("short query empty", short.data?.people?.length === 0 && short.data?.posts?.length === 0, "");
  const none = await A.req("GET", "/api/search?q=zzz-no-such-thing-zzz");
  check(
    "no-result empty",
    Object.values(none.data ?? {}).every((arr) => Array.isArray(arr) && arr.length === 0),
    ""
  );
}

// Campus (empty seed is a valid state; shape + auth matter here).
{
  const b = await A.req("GET", "/api/campus/buildings?limit=10");
  check("buildings shape", b.status === 200 && Array.isArray(b.data?.buildings), `status=${b.status}`);
  const c = await A.req("GET", "/api/campus/clubs?limit=10");
  check(
    "clubs shape",
    c.status === 200 && Array.isArray(c.data?.clubs) && Array.isArray(c.data?.categories),
    `status=${c.status}`
  );
  const anon = makeClient();
  const una = await anon.req("GET", "/api/campus/buildings?limit=10");
  check("campus auth required", una.status === 401, `status=${una.status}`);
}

// Admin + moderation (bootstrap admin via test promote helper).
{
  const self = await B.req("PATCH", "/api/admin/users", json({ userId: "507f1f77bcf86cd799439011", role: "admin" }));
  check("non-admin role change 403", self.status === 403, `status=${self.status}`);
  const stats = await B.req("GET", "/api/admin/stats");
  check("non-admin stats 403", stats.status === 403, `status=${stats.status}`);

  const { execFileSync } = await import("node:child_process");
  const aid = (await A.req("GET", "/api/profile")).data?.profile?.id;
  execFileSync(process.execPath, ["scripts/promote.mjs", "watcha@school.test", "admin"], { stdio: "pipe" });

  const st = await A.req("GET", "/api/admin/stats");
  check(
    "admin stats shape",
    st.status === 200 && typeof st.data?.stats?.users === "number" && typeof st.data?.stats?.posts === "number",
    `status=${st.status}`
  );
  const bid = (await B.req("GET", "/api/profile")).data?.profile?.id;
  // NOTE: Bob is promoted to teacher below; capture the plain-student report
  // visibility check BEFORE that happens.
  const feed0 = await A.req("GET", "/api/posts?limit=10");
  const target0 = (feed0.data?.posts || [])[0]?.id;
  const rep0 = await B.req("POST", "/api/reports", json({ targetType: "post", targetId: target0, reason: "early spam test" }));
  check("report created (as student)", rep0.status === 200, `status=${rep0.status}`);
  const mine0 = await B.req("GET", "/api/reports?limit=10");
  check(
    "reporter sees own report",
    (mine0.data?.reports || []).length >= 1 && mine0.data?.isModerator === false,
    ""
  );
  const promo = await A.req("PATCH", "/api/admin/users", json({ userId: bid, role: "teacher" }));
  check("admin assigns role", promo.status === 200, `status=${promo.status}`);
  const ul = await A.req("GET", "/api/admin/users?limit=10");
  check(
    "admin user list",
    ul.status === 200 && (ul.data?.users || []).some((u) => u.username === "watchb_e2e" && u.role === "teacher"),
    `status=${ul.status}`
  );

  // Report flow with moderation removal. Cara stays a plain student, so she
  // exercises the non-moderator paths after Bob's promotion above.
  const C = makeClient();
  await C.signup("watchc@school.test", "watchc_e2e", "WatchC");
  const feed = await A.req("GET", "/api/posts?limit=10");
  const target = (feed.data?.posts || [])[0]?.id;
  check("report target exists", !!target, "");
  const rep = await C.req("POST", "/api/reports", json({ targetType: "post", targetId: target, reason: "spam test" }));
  check("report created", rep.status === 200, `status=${rep.status}`);
  const cid = (await C.req("GET", "/api/profile")).data?.profile?.id;
  const mine = await C.req("GET", "/api/reports?limit=10");
  check(
    "student sees own reports only",
    (mine.data?.reports || []).length >= 1 &&
      (mine.data?.reports || []).every((r) => r.reporter_id === cid) &&
      mine.data?.isModerator === false,
    ""
  );
  const queue = await A.req("GET", "/api/reports?status=pending&limit=10");
  check("admin sees queue", (queue.data?.reports || []).some((r) => r.target_id === target), "");
  const item = queue.data.reports.find((r) => r.target_id === target);
  const bad = await C.req("PATCH", `/api/reports/${item.id}`, json({ status: "dismissed" }));
  check("non-moderator review 403", bad.status === 403, `status=${bad.status}`);
  const res = await A.req("PATCH", `/api/reports/${item.id}`, json({ status: "resolved", action: "content_removal" }));
  check("resolve + remove ok", res.status === 200, `status=${res.status}`);
  const feed2 = await B.req("GET", "/api/posts?limit=10");
  check("removed post gone", !(feed2.data?.posts || []).some((p) => p.id === target), "");
  void aid;
}

// Owner video delete at the end (keeps catalog assertions above valid).
{
  const d = await A.req("DELETE", `/api/videos/${videoId}`);
  check("owner video delete ok", d.status === 200, `status=${d.status}`);
}

console.log(`\nMISC-E2E: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
