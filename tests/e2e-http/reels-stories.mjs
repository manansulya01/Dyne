/** HTTP E2E: Reels (vertical short video) + Stories (ephemeral).
 *
 * Teacher publishing is server-gated (reels.create / stories.create): students
 * are denied, anonymous callers are unauthenticated. Covers upload buckets,
 * validation, visibility (approved vs held), likes/saves/shares, views,
 * ownership on edit/delete, and malformed-id handling.
 */
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
// Genuine MP4 signature so byte sniffing accepts the upload.
const tinyMp4 = () =>
  new Blob([Buffer.from("00000018667479706d703432", "hex")], { type: "video/mp4" });

const T = makeClient(); // teacher (publisher)
const S = makeClient(); // student (denied publishing)
const N = makeClient(); // anonymous (never signs up)
await T.signup("reelse2e-teacher@school.test", "reelse2e_teacher", "ReelsTeacher");
await S.signup("reelse2e-student@school.test", "reelse2e_student", "ReelsStudent");
execFileSync(
  process.execPath,
  ["scripts/promote.mjs", "reelse2e-teacher@school.test", "teacher"],
  { stdio: "pipe" }
);
const teacherProfile = (await T.req("GET", "/api/profile")).data?.profile;

// ---- Reels: authorization on upload + create ----
let reelUrl;
{
  const anonUp = new FormData();
  anonUp.set("file", tinyMp4(), "clip.mp4");
  anonUp.set("bucket", "reel-videos");
  const anon = await N.req("POST", "/api/upload", { body: anonUp });
  check("anon reel upload 401", anon.status === 401, `status=${anon.status}`);

  const deniedUp = new FormData();
  deniedUp.set("file", tinyMp4(), "clip.mp4");
  deniedUp.set("bucket", "reel-videos");
  const denied = await S.req("POST", "/api/upload", { body: deniedUp });
  check("student reel upload 403", denied.status === 403, `status=${denied.status}`);

  const anonCreate = await N.req("POST", "/api/reels", json({ title: "Nope", videoUrl: "/x.mp4" }));
  check("anon reel create 401", anonCreate.status === 401, `status=${anonCreate.status}`);

  const deniedCreate = await S.req(
    "POST",
    "/api/reels",
    json({ title: "Student clip", videoUrl: "/api/files/reel-videos/s/clip.mp4" })
  );
  check("student reel create 403", deniedCreate.status === 403, `status=${deniedCreate.status}`);

  const okUp = new FormData();
  okUp.set("file", tinyMp4(), "clip.mp4");
  okUp.set("bucket", "reel-videos");
  const up = await T.req("POST", "/api/upload", { body: okUp });
  check("teacher reel upload 200", up.status === 200 && !!up.data?.media?.url, `status=${up.status}`);
  reelUrl = up.data?.media?.url;
}

// ---- Reels: validation ----
{
  const short = await T.req("POST", "/api/reels", json({ title: "ab", videoUrl: reelUrl }));
  check("short title 400", short.status === 400, `status=${short.status}`);
  // Absolute http(s) URLs are accepted by design (isSafeMediaUrl); only
  // non-http schemes and malformed values are rejected.
  const badUrl = await T.req("POST", "/api/reels", json({ title: "Valid title", videoUrl: "javascript:alert(1)" }));
  check("unsafe video url 400", badUrl.status === 400, `status=${badUrl.status}`);
  const tooLong = await T.req(
    "POST",
    "/api/reels",
    json({ title: "Valid title", videoUrl: reelUrl, durationSeconds: 999 })
  );
  check("overlong reel 400", tooLong.status === 400, `status=${tooLong.status}`);
}

// ---- Reels: publish, visibility, engagement ----
let reelId;
let reelApproved = false;
{
  const created = await T.req(
    "POST",
    "/api/reels",
    json({
      title: "Morning assembly highlights",
      caption: "House announcements and the choir finale.",
      videoUrl: reelUrl,
      category: "events",
      hashtags: ["assembly", "choir"],
      width: 720,
      height: 1280,
    })
  );
  check(
    "teacher reel create 201",
    (created.status === 200 || created.status === 201) && !!created.data?.reel?.id,
    `status=${created.status}`
  );
  reelId = created.data?.reel?.id;
  reelApproved = created.data?.moderationStatus === "approved";

  const mine = await T.req("GET", "/api/reels?mine=true&limit=10");
  check(
    "owner sees own reel via mine",
    mine.status === 200 && (mine.data?.reels || []).some((r) => r.id === reelId),
    `status=${mine.status}`
  );

  const feed = await S.req("GET", "/api/reels?limit=10");
  const inFeed = (feed.data?.reels || []).some((r) => r.id === reelId);
  check(
    reelApproved ? "approved reel visible in public feed" : "held reel hidden from public feed",
    feed.status === 200 && (reelApproved ? inFeed : !inFeed),
    `status=${feed.status} approved=${reelApproved}`
  );

  const detail = await S.req("GET", `/api/reels/${reelId}`);
  check(
    reelApproved ? "student reads approved reel" : "student cannot read held reel (404)",
    reelApproved ? detail.status === 200 : detail.status === 404,
    `status=${detail.status} approved=${reelApproved}`
  );

  const badId = await S.req("GET", "/api/reels/not-an-id");
  check("malformed reel id 404", badId.status === 404, `status=${badId.status}`);

  if (reelApproved) {
    const like = await S.req("POST", `/api/reels/${reelId}/like`, json({ action: "like" }));
    check("like ok", like.status === 200 && like.data?.liked === true, `status=${like.status}`);
    const again = await S.req("POST", `/api/reels/${reelId}/like`, json({ action: "like" }));
    check(
      "duplicate like idempotent",
      again.status === 200 && again.data?.liked === true && again.data?.like_count === like.data?.like_count,
      `status=${again.status}`
    );
    const unlike = await S.req("POST", `/api/reels/${reelId}/like`, json({ action: "unlike" }));
    check("unlike ok", unlike.status === 200 && unlike.data?.liked === false, `status=${unlike.status}`);

    const save = await S.req("POST", `/api/reels/${reelId}/save`);
    check("save ok", save.status === 200 && save.data?.saved === true, `status=${save.status}`);
    const savedState = await S.req("GET", `/api/reels/${reelId}/save`);
    check("save state true", savedState.status === 200 && savedState.data?.saved === true, `status=${savedState.status}`);
    const unsave = await S.req("DELETE", `/api/reels/${reelId}/save`);
    check("unsave ok", unsave.status === 200 && unsave.data?.saved === false, `status=${unsave.status}`);

    const share = await S.req("POST", `/api/reels/${reelId}/share`);
    check("share counts", share.status === 200 && share.data?.share_count >= 1, `status=${share.status}`);

    const anonLike = await N.req("POST", `/api/reels/${reelId}/like`, json({ action: "like" }));
    check("anon like 401", anonLike.status === 401, `status=${anonLike.status}`);
  }
}

// ---- Reels: ownership on edit/delete ----
{
  const patch = await T.req("PATCH", `/api/reels/${reelId}`, json({ caption: "Updated caption." }));
  check("owner edit ok", patch.status === 200, `status=${patch.status}`);
  const forged = await S.req("PATCH", `/api/reels/${reelId}`, json({ caption: "Hacked." }));
  check("non-owner edit 403", forged.status === 403, `status=${forged.status}`);

  const deniedDel = await S.req("DELETE", `/api/reels/${reelId}`);
  check("non-owner delete 403", deniedDel.status === 403, `status=${deniedDel.status}`);
  const del = await T.req("DELETE", `/api/reels/${reelId}`);
  check("owner delete ok", del.status === 200, `status=${del.status}`);
  const gone = await T.req("GET", `/api/reels/${reelId}`);
  check("deleted reel gone", gone.status === 404, `status=${gone.status}`);
}

// ---- Stories: authorization + validation ----
let storyId;
let storyApproved = false;
{
  const anon = await N.req("POST", "/api/stories", json({ mediaType: "text", text: "Hi" }));
  check("anon story create 401", anon.status === 401, `status=${anon.status}`);

  const denied = await S.req("POST", "/api/stories", json({ mediaType: "text", text: "Student story" }));
  check("student story create 403", denied.status === 403, `status=${denied.status}`);

  const noMedia = await T.req("POST", "/api/stories", json({ mediaType: "image" }));
  check("image story without mediaUrl 400", noMedia.status === 400, `status=${noMedia.status}`);
  const badType = await T.req("POST", "/api/stories", json({ mediaType: "audio" }));
  check("bad mediaType 400", badType.status === 400, `status=${badType.status}`);
  const emptyText = await T.req("POST", "/api/stories", json({ mediaType: "text", text: "   " }));
  check("empty text story 400", emptyText.status === 400, `status=${emptyText.status}`);

  const created = await T.req(
    "POST",
    "/api/stories",
    json({ mediaType: "text", text: "Good morning campus — library opens at eight.", background: "campus" })
  );
  check(
    "teacher text story 201",
    (created.status === 200 || created.status === 201) && !!created.data?.story?.id,
    `status=${created.status}`
  );
  storyId = created.data?.story?.id;
  storyApproved = created.data?.moderationStatus === "approved";

  const list = await S.req("GET", "/api/stories?limit=20");
  check(
    "stories list shape",
    list.status === 200 && Array.isArray(list.data?.stories) && Array.isArray(list.data?.groups),
    `status=${list.status}`
  );

  const byAuthor = await T.req("GET", `/api/stories?authorId=${teacherProfile?.id}&limit=10`);
  check(
    "owner sees own story via authorId",
    byAuthor.status === 200 && (byAuthor.data?.stories || []).some((s) => s.id === storyId),
    `status=${byAuthor.status}`
  );

  const detail = await S.req("GET", `/api/stories/${storyId}`);
  check(
    storyApproved ? "student reads approved story" : "student cannot read held story (404)",
    storyApproved ? detail.status === 200 : detail.status === 404,
    `status=${detail.status} approved=${storyApproved}`
  );

  const badId = await S.req("GET", "/api/stories/not-an-id");
  check("malformed story id 404", badId.status === 404, `status=${badId.status}`);
}

// ---- Stories: ownership on delete ----
{
  const deniedDel = await S.req("DELETE", `/api/stories/${storyId}`);
  check("non-owner story delete 403", deniedDel.status === 403, `status=${deniedDel.status}`);
  const del = await T.req("DELETE", `/api/stories/${storyId}`);
  check("owner story delete ok", del.status === 200, `status=${del.status}`);
  const gone = await T.req("GET", `/api/stories/${storyId}`);
  check("deleted story gone", gone.status === 404, `status=${gone.status}`);
}

console.log(`\nREELS-STORIES-E2E: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
