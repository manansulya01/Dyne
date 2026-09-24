/** HTTP E2E: communities (CRUD, membership, roles, posts) + events + RSVP. */
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
const slug = "e2e-gamers-" + Date.now().toString(36);
await A.signup("cowner@school.test", "cowner_e2e", "Owner");
await B.signup("cmember@school.test", "cmember_e2e", "Member");
const bid = (await B.req("GET", "/api/profile")).data?.profile?.id;

// Communities: create, list, join, post, edit rules, leave.
let commId;
{
  const r = await A.req("POST", "/api/communities", json({ name: "E2E Gamers", slug, description: "test" }));
  check("create community", r.status === 200 && !!r.data?.community?.id, `status=${r.status}`);
  commId = r.data?.community?.id;
  const dup = await A.req("POST", "/api/communities", json({ name: "Dup", slug }));
  check("duplicate slug 400", dup.status === 400, `status=${dup.status}`);
  const list = await A.req("GET", "/api/communities?limit=10");
  check(
    "community listed with flags",
    list.status === 200 && (list.data?.communities || []).some((c) => c.slug === slug && c.is_owner && c.member_role === "owner"),
    `status=${list.status}`
  );
  const detail = await B.req("GET", `/api/communities/${commId}`);
  check("public detail visible", detail.status === 200 && detail.data?.community?.is_member === false, `status=${detail.status}`);
  const j = await B.req("POST", `/api/communities/${commId}/members`);
  check("join ok", j.status === 200, `status=${j.status}`);
  const j2 = await B.req("POST", `/api/communities/${commId}/members`);
  check("rejoin 400", j2.status === 400, `status=${j2.status}`);
  const members = await A.req("GET", `/api/communities/${commId}/members`);
  check("members listed", members.status === 200 && (members.data?.members || []).length === 2, `status=${members.status}`);

  const fd = new FormData();
  fd.set("content", "Hello gamers!");
  fd.set("communityId", commId);
  const p = await B.req("POST", "/api/community-posts", { body: fd });
  check("community post ok", p.status === 200 && !!p.data?.post?.id, `status=${p.status}`);
  const pl = await B.req("GET", `/api/communities/${commId}/posts?limit=10`);
  check("community posts listed", pl.status === 200 && (pl.data?.posts || []).length === 1, `status=${pl.status}`);

  const e = await A.req("PATCH", `/api/communities/${commId}`, json({ description: "updated" }));
  check("owner edit ok", e.status === 200, `status=${e.status}`);
  const e2 = await B.req("PATCH", `/api/communities/${commId}`, json({ description: "hacked" }));
  check("member edit 403", e2.status === 403, `status=${e2.status}`);

  // Owner promotes B to moderator; B still cannot edit strangers' roles upward.
  const C = makeClient();
  await C.signup("cthird@school.test", "cthird_e2e", "Third");
  const cid = (await C.req("GET", "/api/profile")).data?.profile?.id;
  await C.req("POST", `/api/communities/${commId}/members`);
  const promo = await A.req("PATCH", `/api/communities/${commId}/members/${bid}`, json({ role: "moderator" }));
  check("owner promotes moderator", promo.status === 200, `status=${promo.status}`);
  const badPromo = await B.req("PATCH", `/api/communities/${commId}/members/${cid}`, json({ role: "moderator" }));
  check("moderator cannot promote", badPromo.status === 403, `status=${badPromo.status}`);

  const l = await B.req("DELETE", `/api/communities/${commId}/members`);
  check("leave ok", l.status === 200, `status=${l.status}`);
  const d = await B.req("DELETE", `/api/communities/${commId}`);
  check("member delete 403", d.status === 403, `status=${d.status}`);
}

// Events: role gate, create, RSVP capacity, cancel, private model, edit rules.
let eventId, privId;
{
  const denied = await B.req("POST", "/api/events", json({
    title: "Student Party",
    startTime: new Date(Date.now() + 86400000).toISOString(),
    endTime: new Date(Date.now() + 90000000).toISOString(),
  }));
  check("student create 403", denied.status === 403, `status=${denied.status}`);

  // Bootstrap organizers: test-only direct role assignment (no API can
  // self-promote; scripts/promote.mjs is test tooling, never a route).
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, ["scripts/promote.mjs", "cmember@school.test", "teacher"], { stdio: "pipe" });
  execFileSync(process.execPath, ["scripts/promote.mjs", "cowner@school.test", "admin"], { stdio: "pipe" });

  const start = new Date(Date.now() + 86400000).toISOString();
  const end = new Date(Date.now() + 90000000).toISOString();
  const created = await B.req("POST", "/api/events", json({
    title: "E2E Tournament", description: "gaming night",
    startTime: start, endTime: end, maxAttendees: 1,
  }));
  check("teacher creates capped event", created.status === 200 && !!created.data?.event?.id, `status=${created.status}`);
  eventId = created.data?.event?.id;

  const ra = await A.req("POST", `/api/events/${eventId}/attendees`, json({ status: "going" }));
  check("RSVP going ok", ra.status === 200, `status=${ra.status}`);
  const C2 = makeClient();
  await C2.signup("cfourth@school.test", "cfourth_e2e", "Fourth");
  const full = await C2.req("POST", `/api/events/${eventId}/attendees`, json({ status: "going" }));
  check("capacity enforced", full.status === 400, `status=${full.status}`);
  const intr = await C2.req("POST", `/api/events/${eventId}/attendees`, json({ status: "interested" }));
  check("interested bypasses capacity", intr.status === 200, `status=${intr.status}`);
  const cancel = await A.req("DELETE", `/api/events/${eventId}/attendees`);
  check("cancel RSVP ok", cancel.status === 200, `status=${cancel.status}`);
  const re = await C2.req("POST", `/api/events/${eventId}/attendees`, json({ status: "going" }));
  check("seat freed after cancel", re.status === 200, `status=${re.status}`);
  const ev = await C2.req("GET", `/api/events/${eventId}`);
  check(
    "attendee count + rsvp state",
    ev.data?.event?.attendee_count === 1 && ev.data?.event?.user_rsvp === "going",
    JSON.stringify(ev.data?.event)?.slice(0, 200)
  );
  const hack = await C2.req("PATCH", `/api/events/${eventId}`, json({ title: "Hacked" }));
  check("non-organizer edit 403", hack.status === 403, `status=${hack.status}`);

  const priv = await B.req("POST", "/api/events", json({
    title: "Secret Meeting", startTime: start, endTime: end, isPublic: false,
  }));
  check("private event created", priv.status === 200, `status=${priv.status}`);
  privId = priv.data?.event?.id;
  const blocked = await A.req("POST", `/api/events/${privId}/attendees`, json({ status: "going" }));
  check("private RSVP blocked", blocked.status === 403, `status=${blocked.status}`);
  const org = await B.req("POST", `/api/events/${privId}/attendees`, json({ status: "going" }));
  check("organizer private RSVP ok", org.status === 200, `status=${org.status}`);
  const gone = await B.req("DELETE", `/api/events/${privId}`);
  check("organizer deletes event", gone.status === 200, `status=${gone.status}`);
}
console.log(`\nCOMMUNITIES-E2E: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
