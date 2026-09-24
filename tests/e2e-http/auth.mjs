/**
 * HTTP E2E: authentication area against a running app (APP_BASE).
 * Exit 0 = all pass. No external services; mails/tokens stay server-side.
 */
const BASE = process.env.APP_BASE || "http://127.0.0.1:3100";
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
        /* non-json (redirects) */
      }
      return { status: res.status, data, headers: res.headers };
    },
  };
}

function signupForm(email, username, dn, pw = "Password-123") {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", pw);
  fd.set("confirmPassword", pw);
  fd.set("username", username);
  fd.set("displayName", dn);
  return fd;
}

const A = makeClient();
const B = makeClient();

// Protected route without session redirects to login.
{
  const r = await A.req("GET", "/feed");
  check("logged-out /feed redirects", r.status === 307 || r.status === 308, `status=${r.status}`);
}

// Signup + session cookie.
{
  const r = await A.req("POST", "/api/auth/signup", {
    body: signupForm("alice@school.test", "alice_e2e", "Alice"),
  });
  check("signup ok", r.status === 200 && r.data?.success === true, `status=${r.status} ${JSON.stringify(r.data)?.slice(0, 160)}`);
  const me = await A.req("GET", "/api/profile");
  check("session persists after signup", me.status === 200 && me.data?.profile?.username === "alice_e2e", `status=${me.status}`);
}

// Duplicate username / email rejected with field errors.
{
  const r = await B.req("POST", "/api/auth/signup", {
    body: signupForm("other@school.test", "alice_e2e", "Other"),
  });
  check("duplicate username 400", r.status === 400 && !!r.data?.error?.username, `status=${r.status}`);
  const r2 = await B.req("POST", "/api/auth/signup", {
    body: signupForm("alice@school.test", "other_name", "Other"),
  });
  check("duplicate email 400", r2.status === 400 && !!r2.data?.error?.email, `status=${r2.status} ${JSON.stringify(r2.data)?.slice(0, 160)}`);
}

// B signs up cleanly.
{
  const r = await B.req("POST", "/api/auth/signup", {
    body: signupForm("bob@school.test", "bob_e2e", "Bob"),
  });
  check("second signup ok", r.status === 200, `status=${r.status}`);
}

// Logout destroys the session.
{
  const out = await A.req("POST", "/api/auth/logout");
  check("logout ok", out.status === 200, `status=${out.status}`);
  const me = await A.req("GET", "/api/profile");
  check("logged-out profile blocked", me.status === 401, `status=${me.status}`);
}

// Login: wrong password 401, correct 200, session works.
{
  const bad = await A.req("POST", "/api/auth/login", {
    body: (() => {
      const fd = new FormData();
      fd.set("email", "alice@school.test");
      fd.set("password", "Wrong-Pass-1");
      return fd;
    })(),
  });
  check("wrong password 401", bad.status === 401, `status=${bad.status}`);
  const good = await A.req("POST", "/api/auth/login", {
    body: (() => {
      const fd = new FormData();
      fd.set("email", "alice@school.test");
      fd.set("password", "Password-123");
      return fd;
    })(),
  });
  check("login ok", good.status === 200, `status=${good.status}`);
  const me = await A.req("GET", "/api/profile");
  check("session persists after login", me.status === 200, `status=${me.status}`);
}

// Authenticated users are sent away from /login.
{
  const r = await A.req("GET", "/login");
  check("logged-in /login redirects", r.status === 307 || r.status === 308, `status=${r.status}`);
}

// Password update rotates credentials (old dies, new works).
{
  const fd = new FormData();
  fd.set("password", "Brand-New-Pass-9");
  fd.set("confirmPassword", "Brand-New-Pass-9");
  const r = await A.req("POST", "/api/auth/update-password", { body: fd });
  check("password update ok", r.status === 200, `status=${r.status} ${JSON.stringify(r.data)?.slice(0, 160)}`);
  const C = makeClient();
  const loginOld = await C.req("POST", "/api/auth/login", {
    body: (() => {
      const f = new FormData();
      f.set("email", "alice@school.test");
      f.set("password", "Password-123");
      return f;
    })(),
  });
  check("old password rejected", loginOld.status === 401, `status=${loginOld.status}`);
  const loginNew = await C.req("POST", "/api/auth/login", {
    body: (() => {
      const f = new FormData();
      f.set("email", "alice@school.test");
      f.set("password", "Brand-New-Pass-9");
      return f;
    })(),
  });
  check("new password works", loginNew.status === 200, `status=${loginNew.status}`);
}

// Reset request never reveals account existence; bad tokens rejected.
{
  const fd = new FormData();
  fd.set("email", "nobody-here@school.test");
  const r = await A.req("POST", "/api/auth/reset-password", { body: fd });
  check("reset request always succeeds", r.status === 200 && r.data?.success === true, `status=${r.status}`);
  const bad = await A.req("POST", "/api/auth/reset-confirm", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "bogus-token-value-1234567890", password: "Another-Pass-1", confirmPassword: "Another-Pass-1" }),
  });
  check("bad reset token rejected", bad.status === 400, `status=${bad.status}`);
  const weak = await A.req("POST", "/api/auth/reset-confirm", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "bogus-token-value-1234567890", password: "short", confirmPassword: "short" }),
  });
  check("weak reset password rejected", weak.status === 400, `status=${weak.status}`);
}

console.log(`\nAUTH-E2E: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
