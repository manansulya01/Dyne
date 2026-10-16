/** HTTP E2E: academic domains — tasks, assignments, courses, exams, notes,
 *  goals, habits, study sessions, analytics + cross-user authorization. */
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
const json = (o) => JSON.stringify(o);
const J = { "Content-Type": "application/json" };

const A = makeClient();
const B = makeClient();
const anon = makeClient();
await A.signup("stud_a@school.test", "stud_a_e2e", "Student A");
await B.signup("stud_b@school.test", "stud_b_e2e", "Student B");

// --- Courses ---
let courseId;
{
  const r = await A.req("POST", "/api/courses", { headers: J, body: json({ name: "Physics", code: "PHY-101", color: "blue" }) });
  check("course create 201", r.status === 201, r.status);
  courseId = r.data?.course?.id;
  check("course id returned", typeof courseId === "string" && courseId.length === 24);
  const rb = await B.req("GET", `/api/courses/${courseId}`);
  check("B cannot read A's course (404)", rb.status === 404, rb.status);
}

// --- Tasks: CRUD + cross-user + malformed ---
let taskId;
{
  const r = await A.req("POST", "/api/tasks", { headers: J, body: json({ title: "Revise ch 4", priority: "high", courseId }) });
  check("task create 201", r.status === 201, r.status);
  taskId = r.data?.task?.id;
  const rb = await B.req("GET", `/api/tasks/${taskId}`);
  check("B cannot read A's task (404)", rb.status === 404, rb.status);
  const ub = await B.req("PATCH", `/api/tasks/${taskId}`, { headers: J, body: json({ title: "hijack" }) });
  check("B cannot update A's task (404)", ub.status === 404, ub.status);
  const db = await B.req("DELETE", `/api/tasks/${taskId}`);
  check("B cannot delete A's task (404)", db.status === 404, db.status);
  const bad = await A.req("GET", "/api/tasks/not-an-id");
  check("malformed task id 404 (no 500)", bad.status === 404, bad.status);
  const nosql = await A.req("POST", "/api/tasks", { headers: J, body: json({ title: { $gt: "" } }) });
  check("NoSQL operator title rejected (400)", nosql.status === 400, nosql.status);
  const huge = await A.req("GET", "/api/tasks?limit=99999");
  check("task pagination clamped (200)", huge.status === 200, huge.status);
  const done = await A.req("PATCH", `/api/tasks/${taskId}`, { headers: J, body: json({ completed: true }) });
  check("task complete ok", done.status === 200, done.status);
  const anonList = await anon.req("GET", "/api/tasks");
  check("tasks require auth (401)", anonList.status === 401, anonList.status);
}

// --- Assignments ---
let asgId;
{
  const r = await A.req("POST", "/api/assignments", { headers: J, body: json({ title: "Lab report", courseId, status: "in_progress", progress: 30 }) });
  check("assignment create 201", r.status === 201, r.status);
  asgId = r.data?.assignment?.id;
  const rb = await B.req("PATCH", `/api/assignments/${asgId}`, { headers: J, body: json({ progress: 100 }) });
  check("B cannot update A's assignment (404)", rb.status === 404, rb.status);
  const done = await A.req("PATCH", `/api/assignments/${asgId}`, { headers: J, body: json({ status: "completed" }) });
  check("assignment complete stamps 100%", done.status === 200 && done.data?.assignment?.progress === 100, done.status);
}

// --- Exams ---
{
  const future = new Date(Date.now() + 3 * 86400000).toISOString();
  const r = await A.req("POST", "/api/exams", { headers: J, body: json({ title: "Midterm", courseId, date: future, preparation: 25 }) });
  check("exam create 201", r.status === 201, r.status);
  const examId = r.data?.exam?.id;
  const rb = await B.req("GET", `/api/exams/${examId}`);
  check("B cannot read A's exam (404)", rb.status === 404, rb.status);
  const nx = await A.req("GET", "/api/exams?view=upcoming&next=1");
  check("next exam exposed", nx.status === 200 && nx.data?.next?.id === examId, nx.status);
  const badDate = await A.req("POST", "/api/exams", { headers: J, body: json({ title: "Bad", date: "not-a-date" }) });
  check("malformed exam date rejected (400)", badDate.status === 400, badDate.status);
}

// --- Notes stay private ---
{
  const r = await A.req("POST", "/api/notes", { headers: J, body: json({ title: "Secret", body: "private stuff" }) });
  check("note create 201", r.status === 201, r.status);
  const noteId = r.data?.note?.id;
  const rb = await B.req("GET", `/api/notes/${noteId}`);
  check("B cannot read A's note (404)", rb.status === 404, rb.status);
  const search = await fetch(BASE + "/api/search?q=Secret", { headers: { Cookie: "" } });
  check("search endpoint requires auth", search.status === 401, search.status);
}

// --- Goals ---
{
  const r = await A.req("POST", "/api/goals", { headers: J, body: json({ title: "Study 20h", target: 20, unit: "hours" }) });
  check("goal create 201", r.status === 201, r.status);
  const goalId = r.data?.goal?.id;
  const rb = await B.req("PATCH", `/api/goals/${goalId}`, { headers: J, body: json({ current: 99 }) });
  check("B cannot touch A's goal (404)", rb.status === 404, rb.status);
  const bad = await A.req("POST", "/api/goals", { headers: J, body: json({ title: "Bad", target: -5 }) });
  check("negative goal target rejected (400)", bad.status === 400, bad.status);
}

// --- Habits ---
{
  const r = await A.req("POST", "/api/habits", { headers: J, body: json({ name: "Revision", frequency: "daily", target: 1 }) });
  check("habit create 201", r.status === 201, r.status);
  const habitId = r.data?.habit?.id;
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const log = await A.req("PATCH", `/api/habits/${habitId}`, { headers: J, body: json({ log: { date: key, count: 1 } }) });
  check("habit check-in ok", log.status === 200 && log.data?.habit?.today_count === 1, log.status);
  const rb = await B.req("PATCH", `/api/habits/${habitId}`, { headers: J, body: json({ log: { date: key, count: 1 } }) });
  check("B cannot log A's habit (404)", rb.status === 404, rb.status);
}

// --- Study sessions ---
{
  const r = await A.req("POST", "/api/study-sessions", { headers: J, body: json({ courseId, subject: "Thermo" }) });
  check("session start 201", r.status === 201, r.status);
  const sid = r.data?.session?.id;
  const dup = await A.req("POST", "/api/study-sessions", { headers: J, body: json({}) });
  check("duplicate active session refused (409)", dup.status === 409, dup.status);
  const rb = await B.req("PATCH", `/api/study-sessions/${sid}`, { headers: J, body: json({ action: "finish" }) });
  check("B cannot finish A's session (404)", rb.status === 404, rb.status);
  const pause = await A.req("PATCH", `/api/study-sessions/${sid}`, { headers: J, body: json({ action: "pause" }) });
  check("session pause ok", pause.status === 200, pause.status);
  const resume = await A.req("PATCH", `/api/study-sessions/${sid}`, { headers: J, body: json({ action: "resume" }) });
  check("session resume ok", resume.status === 200, resume.status);
  const fin = await A.req("PATCH", `/api/study-sessions/${sid}`, { headers: J, body: json({ action: "finish" }) });
  check("session finish ok", fin.status === 200, fin.status);
}

// --- Analytics + course detail ---
{
  const a = await A.req("GET", "/api/analytics?range=7");
  check("analytics 200 with real shape", a.status === 200 && a.data?.analytics?.range_days === 7 && Array.isArray(a.data?.analytics?.study?.daily), a.status);
  const bad = await A.req("GET", "/api/analytics?range=banana");
  check("bad range falls back to 7d (200)", bad.status === 200 && bad.data?.analytics?.range_days === 7, bad.status);
  const cd = await A.req("GET", `/api/courses/${courseId}`);
  check("course detail aggregates", cd.status === 200 && Array.isArray(cd.data?.tasks) && Array.isArray(cd.data?.assignments), cd.status);
  const bcd = await B.req("GET", `/api/courses/${courseId}`);
  check("B cannot view A's course detail (404)", bcd.status === 404, bcd.status);
}

console.log(`ACADEMIC-E2E: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
