/** HTTP E2E: posts, uploads, reactions, comments, saves. */
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
await A.signup("poster@school.test", "poster_e2e", "Poster");
await B.signup("reader@school.test", "reader_e2e", "Reader");

// Text post appears in feed with author + counts.
let postId;
{
  const fd = new FormData();
  fd.set("content", "Hello MongoDB feed!");
  const r = await A.req("POST", "/api/posts", { body: fd });
  check("create text post", r.status === 200 && !!r.data?.post?.id, `status=${r.status}`);
  postId = r.data?.post?.id;
  const feed = await A.req("GET", "/api/posts?limit=10");
  const found = (feed.data?.posts || []).find((p) => p.id === postId);
  check(
    "feed shows post with author",
    feed.status === 200 && found?.author?.username === "poster_e2e" && found?.reaction_count === 0,
    `status=${feed.status}`
  );
  const empty = new FormData();
  empty.set("content", "   ");
  const r2 = await A.req("POST", "/api/posts", { body: empty });
  check("empty post rejected", r2.status === 400, `status=${r2.status}`);
}

// Image upload -> staged -> attached post; file served back.
let mediaPostId;
{
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  const fd = new FormData();
  fd.set("file", new Blob([png], { type: "image/png" }), "tiny.png");
  fd.set("bucket", "post-media");
  const up = await A.req("POST", "/api/upload", { body: fd });
  check(
    "image upload staged",
    up.status === 200 && !!up.data?.media?.id && up.data?.media?.media_type === "image",
    `status=${up.status} ${JSON.stringify(up.data)?.slice(0, 160)}`
  );
  const fd2 = new FormData();
  fd2.set("content", "Look at this");
  fd2.append("mediaIds", up.data.media.id);
  const p = await A.req("POST", "/api/posts", { body: fd2 });
  check(
    "post with attached media",
    p.status === 200 && (p.data?.post?.media || []).length === 1,
    `status=${p.status}`
  );
  mediaPostId = p.data?.post?.id;
  const url = p.data?.post?.media?.[0]?.url;
  check("media url is app-served", typeof url === "string" && url.startsWith("/api/files/"), url);
  const file = await A.req("GET", url);
  check("media file served", file.status === 200, `status=${file.status}`);

  // Invalid bucket + bad type rejected; anon blocked.
  const bad = new FormData();
  bad.set("file", new Blob([png], { type: "image/png" }), "x.png");
  bad.set("bucket", "nope");
  const rbad = await A.req("POST", "/api/upload", { body: bad });
  check("invalid bucket rejected", rbad.status === 400, `status=${rbad.status}`);
  const exe = new FormData();
  exe.set("file", new Blob([png], { type: "application/x-msdownload" }), "x.exe");
  const rexe = await A.req("POST", "/api/upload", { body: exe });
  check("bad mime rejected", rexe.status === 400, `status=${rexe.status}`);
  const anon = makeClient();
  const fda = new FormData();
  fda.set("file", new Blob([png], { type: "image/png" }), "x.png");
  const runa = await anon.req("POST", "/api/upload", { body: fda });
  check("anon upload rejected", runa.status === 401, `status=${runa.status}`);
}

// Reactions: add, duplicate 400, state, remove.
{
  const like = await B.req("POST", "/api/reactions", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetType: "post", targetId: postId, reactionType: "like" }),
  });
  check("like ok", like.status === 200, `status=${like.status}`);
  const dup = await B.req("POST", "/api/reactions", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetType: "post", targetId: postId, reactionType: "like" }),
  });
  check("duplicate like 400", dup.status === 400, `status=${dup.status}`);
  const st = await B.req("GET", `/api/reactions?targetType=post&targetId=${postId}`);
  check(
    "reaction state",
    st.status === 200 && st.data?.userReaction === "like" && st.data?.counts?.like === 1,
    `status=${st.status}`
  );
  const un = await B.req("DELETE", `/api/reactions?targetType=post&targetId=${postId}&reactionType=like`);
  check("unlike ok", un.status === 200, `status=${un.status}`);
  await B.req("POST", "/api/reactions", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetType: "post", targetId: postId, reactionType: "like" }),
  });
}

// Comments: create, list, non-owner delete 403, owner delete.
{
  const c = await B.req("POST", "/api/comments", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId, content: "Great post!" }),
  });
  check("comment ok", c.status === 200 && !!c.data?.comment?.id, `status=${c.status}`);
  const cid = c.data?.comment?.id;
  const list = await A.req("GET", `/api/comments?postId=${postId}&limit=10`);
  check("comment listed", list.status === 200 && (list.data?.comments || []).length === 1, `status=${list.status}`);
  const no = await A.req("DELETE", `/api/comments?id=${cid}`);
  check("non-owner comment delete 403", no.status === 403, `status=${no.status}`);
  const yes = await B.req("DELETE", `/api/comments?id=${cid}`);
  check("owner comment delete ok", yes.status === 200, `status=${yes.status}`);
}

// Saves: save, check, unsave, liked list.
{
  const s = await B.req("POST", "/api/saved-posts", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId: mediaPostId }),
  });
  check("save ok", s.status === 200, `status=${s.status}`);
  const dup = await B.req("POST", "/api/saved-posts", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId: mediaPostId }),
  });
  check("duplicate save 400", dup.status === 400, `status=${dup.status}`);
  const chk = await B.req("GET", `/api/saved-posts/check?postId=${mediaPostId}`);
  check("save check true", chk.data?.saved === true, "");
  const list = await B.req("GET", "/api/saved-posts?limit=10");
  check("saved list", list.status === 200 && (list.data?.posts || []).length === 1, `status=${list.status}`);
  const liked = await B.req("GET", "/api/posts/liked?limit=10");
  check(
    "liked list",
    liked.status === 200 && (liked.data?.posts || []).some((p) => p.id === postId),
    `status=${liked.status}`
  );
  const u = await B.req("DELETE", `/api/saved-posts?postId=${mediaPostId}`);
  check("unsave ok", u.status === 200, `status=${u.status}`);
}

// Delete: non-owner 403, owner ok, gone from feed.
{
  const no = await B.req("DELETE", `/api/posts?id=${postId}`);
  check("non-owner post delete 403", no.status === 403, `status=${no.status}`);
  const yes = await A.req("DELETE", `/api/posts?id=${postId}`);
  check("owner post delete ok", yes.status === 200, `status=${yes.status}`);
  const feed = await A.req("GET", "/api/posts?limit=10");
  check("deleted post gone", !(feed.data?.posts || []).some((p) => p.id === postId), "");
}

console.log(`\nPOSTS-E2E: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
