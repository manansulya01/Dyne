/** HTTP E2E: chat (DM create/dedup, send, history, gates, groups, polling shape). */
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
const C = makeClient();
await A.signup("chata@school.test", "chata_e2e", "ChatA");
await B.signup("chatb@school.test", "chatb_e2e", "ChatB");
await C.signup("chatc@school.test", "chatc_e2e", "ChatC");
const bid = (await B.req("GET", "/api/profile")).data?.profile?.id;
const cid = (await C.req("GET", "/api/profile")).data?.profile?.id;

// DM create + dedup + validation.
let convoId;
{
  const bad = await A.req("POST", "/api/chat/conversations", json({ participantIds: [], type: "direct" }));
  check("empty participants 400", bad.status === 400, `status=${bad.status}`);
  const r = await A.req("POST", "/api/chat/conversations", json({ participantIds: [bid], type: "direct" }));
  check("DM created", r.status === 200 && !!r.data?.conversation?.id, `status=${r.status}`);
  convoId = r.data?.conversation?.id;
  const again = await B.req("POST", "/api/chat/conversations", json({ participantIds: [(await A.req("GET", "/api/profile")).data?.profile?.id], type: "direct" }));
  check(
    "DM dedup returns same convo",
    again.status === 200 && again.data?.conversation?.id === convoId,
    `status=${again.status} ${again.data?.conversation?.id}`
  );
  const ghost = await A.req("POST", "/api/chat/conversations", json({ participantIds: ["507f1f77bcf86cd799439011"], type: "direct" }));
  check("unknown user 404", ghost.status === 404, `status=${ghost.status}`);
}

// Send + history + unread lifecycle (what the polling client consumes).
{
  const m1 = await A.req("POST", `/api/chat/conversations/${convoId}/messages`, json({ content: "Hey B!", conversationId: convoId }));
  check("send ok", m1.status === 200 && !!m1.data?.message?.id, `status=${m1.status}`);
  const bad = await A.req("POST", `/api/chat/conversations/${convoId}/messages`, json({ content: "x", conversationId: "507f1f77bcf86cd799439011" }));
  check("conversation mismatch 400", bad.status === 400, `status=${bad.status}`);
  const empty = await A.req("POST", `/api/chat/conversations/${convoId}/messages`, json({ content: "   ", conversationId: convoId }));
  check("empty message 400", empty.status === 400, `status=${empty.status}`);

  const bl = await B.req("GET", "/api/chat/conversations");
  const seen = (bl.data?.conversations || []).find((c) => c.id === convoId);
  check(
    "B list shows convo unread with preview",
    !!seen && seen.unread_count === 1 && !!seen.last_message,
    JSON.stringify(seen)?.slice(0, 200)
  );
  const m2 = await B.req("POST", `/api/chat/conversations/${convoId}/messages`, json({ content: "Hi A!", conversationId: convoId }));
  check("reply ok", m2.status === 200, `status=${m2.status}`);
  const hist = await A.req("GET", `/api/chat/conversations/${convoId}/messages?limit=10`);
  check(
    "history ordered",
    hist.status === 200 && (hist.data?.messages || []).length === 2 &&
      hist.data.messages[0].content === "Hey B!" && hist.data.messages[1].content === "Hi A!",
    `status=${hist.status}`
  );
  const al = await A.req("GET", "/api/chat/conversations");
  check(
    "read state clears after history fetch",
    (al.data?.conversations || []).find((c) => c.id === convoId)?.unread_count === 0,
    ""
  );
}

// Membership gates.
{
  const g = await C.req("GET", `/api/chat/conversations/${convoId}`);
  check("non-member detail blocked", g.status === 403 || g.status === 404, `status=${g.status}`);
  const s = await C.req("POST", `/api/chat/conversations/${convoId}/messages`, json({ content: "intrude", conversationId: convoId }));
  check("non-member send 403", s.status === 403, `status=${s.status}`);
  const h = await C.req("GET", `/api/chat/conversations/${convoId}/messages?limit=10`);
  check("non-member history 403", h.status === 403, `status=${h.status}`);
  const l = await C.req("GET", "/api/chat/conversations");
  check("non-member list excludes", !(l.data?.conversations || []).some((c) => c.id === convoId), "");
}

// Groups: create, add, send.
{
  const g = await A.req("POST", "/api/chat/conversations", json({ participantIds: [bid], type: "group", name: "Study Group" }));
  check("group created", g.status === 200 && !!g.data?.conversation?.id, `status=${g.status}`);
  const gid = g.data?.conversation?.id;
  const add = await A.req("POST", `/api/chat/conversations/${gid}/members`, json({ userIds: [cid] }));
  check("member add ok", add.status === 200, `status=${add.status}`);
  const gm = await C.req("POST", `/api/chat/conversations/${gid}/messages`, json({ content: "Hello group", conversationId: gid }));
  check("new member sends ok", gm.status === 200, `status=${gm.status}`);
  const direct = await A.req("POST", `/api/chat/conversations/${convoId}/members`, json({ userIds: [cid] }));
  check("direct add rejected", direct.status === 400, `status=${direct.status}`);
}

// Conversation detail shape + rename by creator.
{
  const d = await A.req("GET", `/api/chat/conversations/${convoId}`);
  check(
    "detail shape",
    d.status === 200 && Array.isArray(d.data?.conversation?.members) && d.data?.conversation?.members?.length === 2,
    `status=${d.status}`
  );
}

console.log(`\nCHAT-E2E: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
