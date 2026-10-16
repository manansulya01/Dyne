import { describe, expect, it, beforeAll, afterEach } from "vitest";
// Isolate this file's data: every integration file uses its own database.
process.env.MONGODB_DB = "dyne_test_academic";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser } from "@/lib/db/users";
import {
  completeTask,
  createAssignment,
  createCourse,
  createExam,
  createNote,
  createTask,
  deleteAssignment,
  deleteCourse,
  deleteExam,
  deleteNote,
  deleteTask,
  getAssignment,
  getCourse,
  getExam,
  getNote,
  getTask,
  listAssignments,
  listCourses,
  listExams,
  listNotes,
  listTasks,
  nextExam,
  updateAssignment,
  updateCourse,
  updateTask,
} from "@/lib/db/academic";
import {
  createGoal,
  createHabit,
  deleteHabit,
  getAnalytics,
  getGoal,
  getHabit,
  getStudySession,
  habitHistory,
  habitStreak,
  habitStreaks,
  listGoals,
  listHabits,
  logHabitDay,
  sessionEffectiveMs,
  startStudySession,
  transitionStudySession,
  updateGoal,
} from "@/lib/db/productivity";
import { col as rawCol } from "@/lib/mongo/collections";
import type { HabitDoc, StudySessionDoc } from "@/lib/mongo/collections";

function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dayKeyOf(dt);
}

async function makeUser(username: string) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  return r.userId;
}

describe("academic: courses", () => {
  beforeAll(async () => { await ensureIndexes(await getDb()); });
  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("creates, reads, updates, and deletes own courses; user B sees nothing", async () => {
    const db = await getDb();
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const c = await createCourse(db, alice, { name: "Physics", code: "PHY-101", color: "blue" });
    expect(c.ok).toBe(true);
    if (!c.ok) throw new Error("setup");

    expect(await getCourse(db, bob, c.courseId)).toBeNull();
    expect(await getCourse(db, alice, c.courseId)).not.toBeNull();
    expect(await listCourses(db, bob)).toHaveLength(0);

    expect(await updateCourse(db, bob, c.courseId, { name: "X" })).toEqual({ ok: false, reason: "not_found" });
    expect(await deleteCourse(db, bob, c.courseId)).toEqual({ ok: false, reason: "not_found" });
    expect(await deleteCourse(db, alice, c.courseId)).toEqual({ ok: true });
    expect(await getCourse(db, alice, c.courseId)).toBeNull();
  });

  it("deleting a course detaches linked work instead of cascading", async () => {
    const db = await getDb();
    const alice = await makeUser("alice2");
    const c = await createCourse(db, alice, { name: "Chem" });
    if (!c.ok) throw new Error("setup");
    const t = await createTask(db, alice, { title: "Lab", courseId: c.courseId });
    if (!t.ok) throw new Error("setup");
    await deleteCourse(db, alice, c.courseId);
    const row = await getTask(db, alice, t.taskId);
    expect(row).not.toBeNull();
    expect((row as unknown as Record<string, unknown>).courseId).toBeNull();
  });
});

describe("academic: tasks", () => {
  beforeAll(async () => { await ensureIndexes(await getDb()); });
  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("an undated task is excluded from today/upcoming but present in all", async () => {
    // Regression: the Tasks UI defaults to the "today" filter, so saving a
    // task with no due date produced a 201 while showing nothing. The UI now
    // switches to "all" and says so; this pins the server-side invariant that
    // makes that necessary (undated != today/upcoming, but it is a real task).
    const db = await getDb();
    const alice = await makeUser("alice_taskviews");
    const undated = await createTask(db, alice, { title: "No due date" });
    if (!undated.ok) throw new Error("setup");

    expect(await listTasks(db, alice, { view: "today" })).toHaveLength(0);
    expect(await listTasks(db, alice, { view: "upcoming" })).toHaveLength(0);
    const all = await listTasks(db, alice, { view: "all" });
    expect(all).toHaveLength(1);
    expect((all[0] as unknown as Record<string, unknown>).title).toBe("No due date");

    // A due-dated task still lands in "today" so the normal path is unaffected.
    const dated = await createTask(db, alice, { title: "Due today", dueDate: new Date() });
    if (!dated.ok) throw new Error("setup");
    expect(await listTasks(db, alice, { view: "today" })).toHaveLength(1);
  });

  it("CRUD with today/upcoming/completed views and strict ownership", async () => {    const db = await getDb();
    const alice = await makeUser("alice3");
    const bob = await makeUser("bob3");

    const today = await createTask(db, alice, { title: "Today work", dueDate: new Date(), priority: "high" });
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const later = await createTask(db, alice, { title: "Later work", dueDate: future });
    if (!today.ok || !later.ok) throw new Error("setup");

    // Cross-user: B cannot read, update, complete, or delete A's tasks.
    expect(await getTask(db, bob, today.taskId)).toBeNull();
    expect(await updateTask(db, bob, today.taskId, { title: "hijack" })).toEqual({ ok: false, reason: "not_found" });
    expect(await completeTask(db, bob, today.taskId, true)).toEqual({ ok: false, reason: "not_found" });
    expect(await deleteTask(db, bob, today.taskId)).toEqual({ ok: false, reason: "not_found" });

    expect((await listTasks(db, alice, { view: "today" })).length).toBe(1);
    expect((await listTasks(db, alice, { view: "upcoming" })).length).toBe(1);
    expect((await listTasks(db, alice, { view: "completed" })).length).toBe(0);
    expect((await listTasks(db, bob, { view: "all" })).length).toBe(0);

    expect(await completeTask(db, alice, today.taskId, true)).toEqual({ ok: true });
    expect((await listTasks(db, alice, { view: "completed" })).length).toBe(1);
    expect(await completeTask(db, alice, today.taskId, false)).toEqual({ ok: true });
    expect((await listTasks(db, alice, { view: "completed" })).length).toBe(0);

    // Forged course: B cannot attach A's course to B's task.
    const ac = await createCourse(db, alice, { name: "Bio" });
    if (!ac.ok) throw new Error("setup");
    await expect(createTask(db, bob, { title: "x", courseId: ac.courseId })).rejects.toThrow();
  });

  it("partial updates never reset untouched fields (no default bleed)", async () => {
    const db = await getDb();
    const alice = await makeUser("alice12");
    const t = await createTask(db, alice, { title: "Keep priority", priority: "urgent", tags: ["a"] });
    if (!t.ok) throw new Error("setup");
    await updateTask(db, alice, t.taskId, { title: "Renamed" });
    const row = (await getTask(db, alice, t.taskId)) as unknown as Record<string, unknown>;
    expect(row.title).toBe("Renamed");
    expect(row.priority).toBe("urgent");
    expect(row.tags).toEqual(["a"]);

    const a = await createAssignment(db, alice, { title: "Keep", priority: "high", progress: 30 });
    if (!a.ok) throw new Error("setup");
    await updateAssignment(db, alice, a.assignmentId, { status: "completed" });
    const arow = (await getAssignment(db, alice, a.assignmentId)) as unknown as Record<string, unknown>;
    expect(arow.status).toBe("completed");
    expect(arow.progress).toBe(100);
    expect(arow.priority).toBe("high");
  });
});

describe("academic: assignments + exams + notes", () => {
  beforeAll(async () => { await ensureIndexes(await getDb()); });
  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("assignment lifecycle stamps completion and stays owner-scoped", async () => {
    const db = await getDb();
    const alice = await makeUser("alice4");
    const bob = await makeUser("bob4");
    const a = await createAssignment(db, alice, { title: "Essay", progress: 20 });
    if (!a.ok) throw new Error("setup");

    expect(await getAssignment(db, bob, a.assignmentId)).toBeNull();
    expect(await updateAssignment(db, bob, a.assignmentId, { progress: 100 })).toEqual({ ok: false, reason: "not_found" });
    expect(await deleteAssignment(db, bob, a.assignmentId)).toEqual({ ok: false, reason: "not_found" });

    await updateAssignment(db, alice, a.assignmentId, { status: "completed" });
    const row = (await getAssignment(db, alice, a.assignmentId)) as unknown as Record<string, unknown>;
    expect(row.status).toBe("completed");
    expect(row.completedAt).not.toBeNull();
    expect(row.progress).toBe(100);
    expect((await listAssignments(db, alice, { status: "open" })).length).toBe(0);
  });

  it("exams expose nextExam and stay owner-scoped", async () => {
    const db = await getDb();
    const alice = await makeUser("alice5");
    const bob = await makeUser("bob5");
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);
    const e = await createExam(db, alice, { title: "Final", date: soon, preparation: 40 });
    if (!e.ok) throw new Error("setup");

    expect(await getExam(db, bob, e.examId)).toBeNull();
    expect(await deleteExam(db, bob, e.examId)).toEqual({ ok: false, reason: "not_found" });
    const nx = await nextExam(db, alice);
    expect(nx).not.toBeNull();
    expect(await nextExam(db, bob)).toBeNull();
    expect((await listExams(db, alice, { view: "upcoming" })).length).toBe(1);
  });

  it("notes are private: B cannot read, list, or delete A's notes", async () => {
    const db = await getDb();
    const alice = await makeUser("alice6");
    const bob = await makeUser("bob6");
    const n = await createNote(db, alice, { title: "Secret", body: "private content here" });
    if (!n.ok) throw new Error("setup");

    expect(await getNote(db, bob, n.noteId)).toBeNull();
    expect(await deleteNote(db, bob, n.noteId)).toEqual({ ok: false, reason: "not_found" });
    expect(await listNotes(db, bob, {})).toHaveLength(0);
    expect(await listNotes(db, bob, { search: "private" })).toHaveLength(0);
    expect(await listNotes(db, alice, { search: "private" })).toHaveLength(1);
  });
});

describe("productivity: goals, habits, sessions, analytics", () => {
  beforeAll(async () => { await ensureIndexes(await getDb()); });
  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("goal ownership and progress updates", async () => {
    const db = await getDb();
    const alice = await makeUser("alice7");
    const bob = await makeUser("bob7");
    const g = await createGoal(db, alice, { title: "Study 20h", target: 20, unit: "hours" });
    if (!g.ok) throw new Error("setup");

    expect(await updateGoal(db, bob, g.goalId, { current: 99 })).toEqual({ ok: false, reason: "not_found" });
    expect(await updateGoal(db, alice, g.goalId, { current: -1 })).toEqual({ ok: false, reason: "bad_current" });
    expect(await updateGoal(db, alice, g.goalId, { current: 5 })).toEqual({ ok: true });
    expect((await listGoals(db, bob, {}))).toHaveLength(0);
    expect((await listGoals(db, alice, { status: "open" }))).toHaveLength(1);
  });

  it("habit logging, history, and streaks are owner-scoped", async () => {
    const db = await getDb();
    const alice = await makeUser("alice8");
    const bob = await makeUser("bob8");
    const h = await createHabit(db, alice, { name: "Revision", frequency: "daily", target: 1 });
    if (!h.ok) throw new Error("setup");

    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const ykey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;

    // B cannot log to A's habit.
    expect(await logHabitDay(db, bob, h.habitId, key, 1)).toEqual({ ok: false, reason: "not_found" });
    expect((await habitHistory(db, bob, h.habitId)).ok).toBe(false);

    await logHabitDay(db, alice, h.habitId, ykey, 1);
    await logHabitDay(db, alice, h.habitId, key, 1);
    const row = await getHabit(db, alice, h.habitId);
    expect((row as unknown as Record<string, unknown>).streak).toBe(2);
    const hist = await habitHistory(db, alice, h.habitId);
    expect(hist.ok && hist.logs.length).toBe(2);
    expect(await deleteHabit(db, bob, h.habitId)).toEqual({ ok: false, reason: "not_found" });
  });

  it("study session lifecycle: one active max, pause/resume/finish, owner-scoped", async () => {
    const db = await getDb();
    const alice = await makeUser("alice9");
    const bob = await makeUser("bob9");

    const s1 = await startStudySession(db, alice, { subject: "Physics" });
    expect(s1.ok).toBe(true);
    if (!s1.ok) throw new Error("setup");

    // Second concurrent session is refused.
    expect(await startStudySession(db, alice, {})).toEqual({ ok: false, reason: "already_active" });
    // B cannot see or touch A's session.
    expect(await getStudySession(db, bob, s1.sessionId)).toBeNull();
    expect(await transitionStudySession(db, bob, s1.sessionId, "finish")).toEqual({ ok: false, reason: "not_found" });

    // Invalid transition: resume while active.
    expect(await transitionStudySession(db, alice, s1.sessionId, "resume")).toEqual({ ok: false, reason: "bad_transition" });
    expect(await transitionStudySession(db, alice, s1.sessionId, "pause")).toEqual({ ok: true });
    expect(await transitionStudySession(db, alice, s1.sessionId, "pause")).toEqual({ ok: false, reason: "bad_transition" });
    expect(await transitionStudySession(db, alice, s1.sessionId, "resume")).toEqual({ ok: true });
    expect(await transitionStudySession(db, alice, s1.sessionId, "finish")).toEqual({ ok: true });
    expect(await transitionStudySession(db, alice, s1.sessionId, "finish")).toEqual({ ok: false, reason: "bad_transition" });

    // After finish, a new session may start.
    expect((await startStudySession(db, alice, {})).ok).toBe(true);
  });

  it("analytics reflect real completions, sessions, and habits", async () => {
    const db = await getDb();
    const alice = await makeUser("alice10");

    const t = await createTask(db, alice, { title: "Done thing" });
    if (!t.ok) throw new Error("setup");
    await completeTask(db, alice, t.taskId, true);

    const s = await startStudySession(db, alice, { subject: "Math" });
    if (!s.ok) throw new Error("setup");
    await transitionStudySession(db, alice, s.sessionId, "finish");

    const h = await createHabit(db, alice, { name: "Read" });
    if (!h.ok) throw new Error("setup");

    const a = await getAnalytics(db, alice, 7);
    expect(a.tasks.completed).toBe(1);
    expect(a.tasks.created).toBe(1);
    expect(a.tasks.completion_rate).toBe(100);
    expect(a.study.total_seconds).toBeGreaterThanOrEqual(0);
    expect(a.study.daily.length).toBe(7);
    expect(a.habits.active_count).toBe(1);
    expect(a.goals.total).toBe(0);

    const empty = await getAnalytics(db, await makeUser("alice11"), 7);
    expect(empty.tasks.completion_rate).toBeNull();
    expect(empty.habits.consistency_rate).toBeNull();
  });

  it("weekly habit streaks count Monday-bucketed weeks and stop at gaps", async () => {
    const db = await getDb();
    const alice = await makeUser("alice12");
    const h = await createHabit(db, alice, { name: "Weekly review", frequency: "weekly", target: 3 });
    if (!h.ok) throw new Error("setup");

    // Week buckets are Monday-anchored, so logs must sit strictly inside each
    // week's Monday..Sunday window (a Sunday log belongs to the NEXT week).
    const mondayOf = (key: string): string => {
      const [y, m, d] = key.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
      return dayKeyOf(dt);
    };
    const thisMonday = mondayOf(dayKeyOf(new Date()));
    const lastMonday = shiftKey(thisMonday, -7);
    const twoMondaysAgo = shiftKey(thisMonday, -14);
    for (const d of [twoMondaysAgo, shiftKey(twoMondaysAgo, 1), shiftKey(twoMondaysAgo, 2)]) {
      await logHabitDay(db, alice, h.habitId, d, 1);
    }
    for (const d of [lastMonday, shiftKey(lastMonday, 1), shiftKey(lastMonday, 2)]) {
      await logHabitDay(db, alice, h.habitId, d, 1);
    }
    // The current week is still in progress and empty: the earned streak holds.
    const row = await getHabit(db, alice, h.habitId);
    expect((row as unknown as Record<string, unknown>).streak).toBe(2);

    // Clearing the older week leaves only the most recent complete week.
    await rawCol(db, "habitLogs").deleteMany({
      userId: (await rawCol<HabitDoc>(db, "habits").findOne({ _id: h.habitId } as never))!.userId,
      date: { $gte: twoMondaysAgo, $lt: lastMonday },
    } as never);
    expect((await getHabit(db, alice, h.habitId)) as unknown as Record<string, unknown>).toMatchObject({ streak: 1 });

    // A partial current week below target does not extend (but does not break) the streak.
    await logHabitDay(db, alice, h.habitId, thisMonday, 1);
    await logHabitDay(db, alice, h.habitId, shiftKey(thisMonday, 1), 1);
    expect((await getHabit(db, alice, h.habitId)) as unknown as Record<string, unknown>).toMatchObject({ streak: 1 });
    // Reaching the target in the current week extends the streak to 3.
    await logHabitDay(db, alice, h.habitId, shiftKey(thisMonday, 2), 1);
    expect((await getHabit(db, alice, h.habitId)) as unknown as Record<string, unknown>).toMatchObject({ streak: 2 });
  });

  it("duplicate daily logs overwrite instead of accumulating", async () => {
    const db = await getDb();
    const alice = await makeUser("alice13");
    const h = await createHabit(db, alice, { name: "Water", frequency: "daily", target: 1 });
    if (!h.ok) throw new Error("setup");
    const today = dayKeyOf(new Date());
    await logHabitDay(db, alice, h.habitId, today, 3);
    await logHabitDay(db, alice, h.habitId, today, 5);
    const row = await getHabit(db, alice, h.habitId);
    expect((row as unknown as Record<string, unknown>).todayCount).toBe(5);
    const logs = await rawCol(db, "habitLogs").countDocuments({ habitId: h.habitId, date: today } as never);
    expect(logs).toBe(1);
    // Logging 0 clears the day entirely.
    await logHabitDay(db, alice, h.habitId, today, 0);
    expect((await getHabit(db, alice, h.habitId)) as unknown as Record<string, unknown>).toMatchObject({ todayCount: 0 });
  });

  it("batched streaks match single-habit streaks for many habits", async () => {
    const db = await getDb();
    const alice = await makeUser("alice14");
    const a = await createHabit(db, alice, { name: "A", frequency: "daily", target: 1 });
    const b = await createHabit(db, alice, { name: "B", frequency: "daily", target: 2 });
    const c = await createHabit(db, alice, { name: "C", frequency: "daily", target: 1 });
    if (!a.ok || !b.ok || !c.ok) throw new Error("setup");
    const today = dayKeyOf(new Date());
    // A: today + yesterday => 2.  B: yesterday only (below today's target) => 1.
    // C: nothing => 0.
    await logHabitDay(db, alice, a.habitId, today, 1);
    await logHabitDay(db, alice, a.habitId, shiftKey(today, -1), 1);
    await logHabitDay(db, alice, b.habitId, shiftKey(today, -1), 2);
    const docs = await rawCol<HabitDoc>(db, "habits")
      .find({ _id: { $in: [a.habitId, b.habitId, c.habitId] } } as never)
      .toArray();
    const batched = await habitStreaks(db, alice, docs);
    for (const doc of docs) {
      expect(batched.get(doc._id.toHexString())).toBe(await habitStreak(db, alice, doc));
    }
    expect(batched.get(a.habitId.toHexString())).toBe(2);
    expect(batched.get(b.habitId.toHexString())).toBe(1);
    expect(batched.get(c.habitId.toHexString())).toBe(0);
    // listHabits exposes the same streak values.
    const listed = await listHabits(db, alice);
    const byName = new Map(listed.map((h) => [String((h as Record<string, unknown>).name), h as Record<string, unknown>]));
    expect(byName.get("A")?.streak).toBe(2);
    expect(byName.get("B")?.streak).toBe(1);
    expect(byName.get("C")?.streak).toBe(0);
  });

  it("effective study time excludes paused seconds and open pauses", async () => {
    const base = new Date("2026-01-01T10:00:00.000Z");
    const doc = (over: Partial<StudySessionDoc>): StudySessionDoc =>
      ({
        userId: undefined,
        startedAt: base,
        endedAt: null,
        pausedSeconds: 0,
        pauseStartedAt: null,
        status: "active",
        createdAt: base,
        updatedAt: base,
        ...over,
      }) as unknown as StudySessionDoc;

    // No pause: elapsed equals wall clock.
    expect(sessionEffectiveMs(doc({}), new Date(base.getTime() + 60_000))).toBe(60_000);
    // Completed with 20s paused: paused time excluded.
    expect(
      sessionEffectiveMs(
        doc({ status: "completed", endedAt: new Date(base.getTime() + 100_000), pausedSeconds: 20 }),
        new Date(base.getTime() + 100_000)
      )
    ).toBe(80_000);
    // Paused with an open pause: in-progress pause time is excluded.
    expect(
      sessionEffectiveMs(
        doc({ status: "paused", pausedSeconds: 10, pauseStartedAt: new Date(base.getTime() + 30_000) }),
        new Date(base.getTime() + 60_000)
      )
    ).toBe(20_000);
    // Cancelled stops at updatedAt.
    expect(
      sessionEffectiveMs(
        doc({ status: "cancelled", endedAt: null, updatedAt: new Date(base.getTime() + 45_000) }),
        new Date(base.getTime() + 600_000)
      )
    ).toBe(45_000);
    // Never negative.
    expect(
      sessionEffectiveMs(
        doc({ status: "completed", endedAt: new Date(base.getTime() + 10_000), pausedSeconds: 999 }),
        new Date(base.getTime() + 10_000)
      )
    ).toBe(0);
  });

  it("goal progress respects boundaries and completion state", async () => {
    const db = await getDb();
    const alice = await makeUser("alice15");
    const g = await createGoal(db, alice, { title: "Read 12 books", target: 12, current: 0, unit: "books" });
    if (!g.ok) throw new Error("setup");
    // Negative progress is rejected (bad_current), not silently clamped in the DB layer.
    expect(await updateGoal(db, alice, g.goalId, { current: -5 })).toEqual({ ok: false, reason: "bad_current" });
    expect(await updateGoal(db, alice, g.goalId, { current: 0 })).toEqual({ ok: true });
    const after = await getGoal(db, alice, g.goalId);
    expect((after as unknown as Record<string, unknown>).current).toBe(0);
    // Marking complete then reopening is reflected in status.
    expect(await updateGoal(db, alice, g.goalId, { status: "completed" })).toEqual({ ok: true });
    expect((await getGoal(db, alice, g.goalId)) as unknown as Record<string, unknown>).toMatchObject({ status: "completed" });
    expect(await updateGoal(db, alice, g.goalId, { status: "active" })).toEqual({ ok: true });
    expect((await getGoal(db, alice, g.goalId)) as unknown as Record<string, unknown>).toMatchObject({ status: "active" });
  });
});
