import { Db, ObjectId } from "mongodb";
import {
  col,
  type CourseDoc,
  type GoalDoc,
  type GoalStatus,
  type HabitDoc,
  type HabitFrequency,
  type HabitLogDoc,
  type StudySessionDoc,
  type StudySessionStatus,
} from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { serialize, serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";

/* -------------------------------- Goals -------------------------------- */

export interface GoalInput {
  title: string;
  description?: string | null;
  target: number;
  current?: number;
  unit?: string;
  deadline?: Date | null;
  status?: GoalStatus;
}

export async function createGoal(db: Db, userId: string | ObjectId, input: GoalInput) {
  const now = new Date();
  const res = await col<GoalDoc>(db, "goals").insertOne({
    userId: toObjectId(userId),
    title: input.title.trim(),
    description: input.description?.trim() || null,
    target: input.target,
    current: Math.max(input.current ?? 0, 0),
    unit: input.unit?.trim().slice(0, 30) || "units",
    deadline: input.deadline ?? null,
    status: input.status ?? "active",
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, goalId: res.insertedId };
}

export async function listGoals(
  db: Db,
  userId: string | ObjectId,
  opts: { status?: GoalStatus | "open"; limit?: number } = {}
) {
  const q: Record<string, unknown> = { userId: toObjectId(userId) };
  if (opts.status === "open") q.status = { $in: ["active"] };
  else if (opts.status) q.status = opts.status;
  const rows = await col<GoalDoc>(db, "goals")
    .find(q as never)
    .sort({ deadline: 1, createdAt: -1, _id: -1 })
    .limit(safeLimit(opts.limit, 100))
    .toArray();
  return serializeMany(rows);
}

export async function getGoal(db: Db, userId: string | ObjectId, id: string | ObjectId) {
  const row = await col<GoalDoc>(db, "goals").findOne({
    _id: toObjectId(id),
    userId: toObjectId(userId),
  } as never);
  return row ? serialize(row) : null;
}

export async function updateGoal(
  db: Db,
  userId: string | ObjectId,
  id: string | ObjectId,
  patch: Partial<GoalInput>
) {
  const uid = toObjectId(userId);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    if (!patch.title.trim() || patch.title.length > 200) return { ok: false as const, reason: "bad_title" as const };
    set.title = patch.title.trim();
  }
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.target !== undefined) {
    if (!(patch.target > 0)) return { ok: false as const, reason: "bad_target" as const };
    set.target = patch.target;
  }
  if (patch.current !== undefined) {
    if (!(patch.current >= 0)) return { ok: false as const, reason: "bad_current" as const };
    set.current = patch.current;
  }
  if (patch.unit !== undefined) set.unit = patch.unit.trim().slice(0, 30) || "units";
  if (patch.deadline !== undefined) set.deadline = patch.deadline;
  if (patch.status !== undefined) set.status = patch.status;
  const res = await col<GoalDoc>(db, "goals").updateOne(
    { _id: toObjectId(id), userId: uid } as never,
    { $set: set }
  );
  return res.matchedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

export async function deleteGoal(db: Db, userId: string | ObjectId, id: string | ObjectId) {
  const res = await col<GoalDoc>(db, "goals").deleteOne({
    _id: toObjectId(id),
    userId: toObjectId(userId),
  } as never);
  return res.deletedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

/* -------------------------------- Habits ------------------------------- */

export interface HabitInput {
  name: string;
  frequency?: HabitFrequency;
  target?: number;
  isActive?: boolean;
}

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return dayKey(dt);
}

export async function createHabit(db: Db, userId: string | ObjectId, input: HabitInput) {
  const now = new Date();
  const res = await col<HabitDoc>(db, "habits").insertOne({
    userId: toObjectId(userId),
    name: input.name.trim(),
    frequency: input.frequency ?? "daily",
    target: Math.min(Math.max(Math.round(input.target ?? 1), 1), 100),
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, habitId: res.insertedId };
}

export async function listHabits(
  db: Db,
  userId: string | ObjectId,
  opts: { activeOnly?: boolean; limit?: number } = {}
) {
  const uid = toObjectId(userId);
  const q: Record<string, unknown> = { userId: uid };
  if (opts.activeOnly) q.isActive = true;
  const rows = await col<HabitDoc>(db, "habits")
    .find(q as never)
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit(opts.limit, 100))
    .toArray();
  const today = dayKey(new Date());
  const logs = await col<HabitLogDoc>(db, "habitLogs")
    .find({ userId: uid, habitId: { $in: rows.map((r) => r._id) }, date: today } as never)
    .toArray();
  const todayByHabit = new Map(logs.map((l) => [l.habitId.toHexString(), l.count]));
  // One batched streak query instead of one per habit.
  const streaks = await habitStreaks(db, uid, rows);
  const out = rows.map((r) => ({
    ...r,
    todayCount: todayByHabit.get(r._id.toHexString()) ?? 0,
    streak: streaks.get(r._id.toHexString()) ?? 0,
  }));
  return serializeMany(out);
}

export async function getHabit(db: Db, userId: string | ObjectId, id: string | ObjectId) {
  const uid = toObjectId(userId);
  const row = await col<HabitDoc>(db, "habits").findOne({
    _id: toObjectId(id),
    userId: uid,
  } as never);
  if (!row) return null;
  const today = dayKey(new Date());
  const todayLog = await col<HabitLogDoc>(db, "habitLogs").findOne({
    habitId: row._id,
    userId: uid,
    date: today,
  } as never);
  return serialize({
    ...row,
    todayCount: todayLog?.count ?? 0,
    streak: await habitStreak(db, uid, row),
  });
}

export async function updateHabit(
  db: Db,
  userId: string | ObjectId,
  id: string | ObjectId,
  patch: Partial<HabitInput>
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    if (!patch.name.trim() || patch.name.length > 100) return { ok: false as const, reason: "bad_name" as const };
    set.name = patch.name.trim();
  }
  if (patch.frequency !== undefined) set.frequency = patch.frequency;
  if (patch.target !== undefined) set.target = Math.min(Math.max(Math.round(patch.target), 1), 100);
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  const res = await col<HabitDoc>(db, "habits").updateOne(
    { _id: toObjectId(id), userId: toObjectId(userId) } as never,
    { $set: set }
  );
  return res.matchedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

export async function deleteHabit(db: Db, userId: string | ObjectId, id: string | ObjectId) {
  const uid = toObjectId(userId);
  const hid = toObjectId(id);
  const res = await col<HabitDoc>(db, "habits").deleteOne({ _id: hid, userId: uid } as never);
  if (res.deletedCount === 0) return { ok: false as const, reason: "not_found" as const };
  await col<HabitLogDoc>(db, "habitLogs").deleteMany({ habitId: hid, userId: uid } as never);
  return { ok: true as const };
}

/** Set (or clear with count 0) one day's log. Habit must belong to the user. */
export async function logHabitDay(
  db: Db,
  userId: string | ObjectId,
  habitId: string | ObjectId,
  date: string,
  count: number
) {
  const uid = toObjectId(userId);
  const hid = toObjectId(habitId);
  const habit = await col<HabitDoc>(db, "habits").findOne({ _id: hid, userId: uid } as never);
  if (!habit) return { ok: false as const, reason: "not_found" as const };
  if (count === 0) {
    await col<HabitLogDoc>(db, "habitLogs").deleteOne({ habitId: hid, userId: uid, date } as never);
  } else {
    await col<HabitLogDoc>(db, "habitLogs").updateOne(
      { habitId: hid, userId: uid, date } as never,
      { $set: { count, habitId: hid, userId: uid, date }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
  }
  return { ok: true as const };
}

export async function habitHistory(
  db: Db,
  userId: string | ObjectId,
  habitId: string | ObjectId,
  days = 30
) {
  const uid = toObjectId(userId);
  const hid = toObjectId(habitId);
  const habit = await col<HabitDoc>(db, "habits").findOne({ _id: hid, userId: uid } as never);
  if (!habit) return { ok: false as const, reason: "not_found" as const };
  const rows = await col<HabitLogDoc>(db, "habitLogs")
    .find({ habitId: hid, userId: uid } as never)
    .sort({ date: -1 })
    .limit(safeLimit(days, 365, 30))
    .toArray();
  return { ok: true as const, logs: serializeMany(rows) };
}

/** Consecutive-day (daily) or consecutive-week (weekly) streak meeting target. */
export async function habitStreak(
  db: Db,
  userId: string | ObjectId,
  habit: HabitDoc
): Promise<number> {
  const uid = toObjectId(userId);
  const rows = await col<HabitLogDoc>(db, "habitLogs")
    .find({ habitId: habit._id, userId: uid } as never)
    .project({ date: 1, count: 1 })
    .toArray();
  return streakFromLogs(new Map(rows.map((r) => [r.date, r.count])), habit);
}

/** Streaks for many habits in ONE query (listHabits previously did N+1 reads). */
export async function habitStreaks(
  db: Db,
  userId: string | ObjectId,
  habits: HabitDoc[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (habits.length === 0) return out;
  const uid = toObjectId(userId);
  const rows = await col<HabitLogDoc>(db, "habitLogs")
    .find({ habitId: { $in: habits.map((h) => h._id) }, userId: uid } as never)
    .project({ habitId: 1, date: 1, count: 1 })
    .toArray();
  const byHabit = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const key = r.habitId.toHexString();
    let dates = byHabit.get(key);
    if (!dates) {
      dates = new Map<string, number>();
      byHabit.set(key, dates);
    }
    dates.set(r.date, r.count);
  }
  for (const h of habits) {
    out.set(h._id.toHexString(), streakFromLogs(byHabit.get(h._id.toHexString()) ?? new Map(), h));
  }
  return out;
}

/** Pure streak computation shared by single and batched paths. */
function streakFromLogs(byDate: Map<string, number>, habit: HabitDoc): number {
  const met = (key: string) => (byDate.get(key) ?? 0) >= habit.target;
  if (habit.frequency === "daily") {
    let cursor = dayKey(new Date());
    if (!met(cursor)) cursor = shiftDay(cursor, -1);
    let streak = 0;
    while (met(cursor)) {
      streak += 1;
      cursor = shiftDay(cursor, -1);
    }
    return streak;
  }
  // Weekly: ISO-ish week buckets keyed by Monday.
  const mondayOf = (key: string): string => {
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = (dt.getDay() + 6) % 7;
    dt.setDate(dt.getDate() - dow);
    return dayKey(dt);
  };
  const weekTotals = new Map<string, number>();
  for (const [date, count] of byDate) {
    const wk = mondayOf(date);
    weekTotals.set(wk, (weekTotals.get(wk) ?? 0) + count);
  }
  let cursor = mondayOf(dayKey(new Date()));
  if ((weekTotals.get(cursor) ?? 0) < habit.target) cursor = shiftDay(cursor, -7);
  let streak = 0;
  while ((weekTotals.get(cursor) ?? 0) >= habit.target) {
    streak += 1;
    cursor = shiftDay(cursor, -7);
  }
  return streak;
}

/* ----------------------------- Study sessions -------------------------- */

/** Effective studied milliseconds (excludes paused time, including an open pause). */
export function sessionEffectiveMs(s: StudySessionDoc, now: Date = new Date()): number {
  const end = s.endedAt ?? (s.status === "cancelled" ? s.updatedAt : now);
  let ms = end.getTime() - s.startedAt.getTime() - s.pausedSeconds * 1000;
  if (s.pauseStartedAt && (s.status === "active" || s.status === "paused")) {
    ms -= now.getTime() - s.pauseStartedAt.getTime();
  }
  return Math.max(ms, 0);
}

async function activeSession(db: Db, uid: ObjectId) {
  return col<StudySessionDoc>(db, "studySessions").findOne({
    userId: uid,
    status: { $in: ["active", "paused"] },
  } as never);
}

export async function startStudySession(
  db: Db,
  userId: string | ObjectId,
  input: { courseId?: string | ObjectId | null; subject?: string | null; note?: string | null }
) {
  const uid = toObjectId(userId);
  if (await activeSession(db, uid)) {
    return { ok: false as const, reason: "already_active" as const };
  }
  let courseId: ObjectId | null = null;
  if (input.courseId) {
    courseId = toObjectId(input.courseId);
    const course = await col<CourseDoc>(db, "courses").findOne({ _id: courseId, userId: uid } as never);
    if (!course) return { ok: false as const, reason: "bad_course" as const };
  }
  const now = new Date();
  const res = await col<StudySessionDoc>(db, "studySessions").insertOne({
    userId: uid,
    courseId,
    subject: input.subject?.trim().slice(0, 100) || null,
    note: input.note?.trim().slice(0, 2000) || null,
    startedAt: now,
    pauseStartedAt: null,
    pausedSeconds: 0,
    endedAt: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, sessionId: res.insertedId };
}

export async function getStudySession(db: Db, userId: string | ObjectId, id: string | ObjectId) {
  const row = await col<StudySessionDoc>(db, "studySessions").findOne({
    _id: toObjectId(id),
    userId: toObjectId(userId),
  } as never);
  if (!row) return null;
  return serialize({ ...row, durationSeconds: Math.floor(sessionEffectiveMs(row) / 1000) });
}

export async function listStudySessions(
  db: Db,
  userId: string | ObjectId,
  opts: { limit?: number; status?: StudySessionStatus; from?: Date; to?: Date } = {}
) {
  const q: Record<string, unknown> = { userId: toObjectId(userId) };
  if (opts.status) q.status = opts.status;
  if (opts.from || opts.to) {
    const range: Record<string, Date> = {};
    if (opts.from) range.$gte = opts.from;
    if (opts.to) range.$lte = opts.to;
    q.startedAt = range;
  }
  const rows = await col<StudySessionDoc>(db, "studySessions")
    .find(q as never)
    .sort({ startedAt: -1, _id: -1 })
    .limit(safeLimit(opts.limit, 100))
    .toArray();
  const now = new Date();
  const briefs = new Map<string, { id: string; name: string; color: string }>();
  const cids = [...new Set(rows.filter((r) => r.courseId).map((r) => r.courseId!.toHexString()))];
  if (cids.length > 0) {
    const courses = await col<CourseDoc>(db, "courses")
      .find({ _id: { $in: cids.map((id) => new ObjectId(id)) } } as never)
      .project({ name: 1, color: 1 })
      .toArray();
    for (const c of courses) briefs.set(c._id.toHexString(), { id: c._id.toHexString(), name: c.name, color: c.color });
  }
  return serializeMany(
    rows.map((r) => ({
      ...r,
      durationSeconds: Math.floor(sessionEffectiveMs(r, now) / 1000),
      course: r.courseId ? (briefs.get(r.courseId.toHexString()) ?? null) : null,
    }))
  );
}

export async function transitionStudySession(
  db: Db,
  userId: string | ObjectId,
  id: string | ObjectId,
  action: "pause" | "resume" | "finish" | "cancel",
  patch: { courseId?: string | ObjectId | null; subject?: string | null; note?: string | null } = {}
) {
  const uid = toObjectId(userId);
  const sid = toObjectId(id);
  const row = await col<StudySessionDoc>(db, "studySessions").findOne({ _id: sid, userId: uid } as never);
  if (!row) return { ok: false as const, reason: "not_found" as const };
  const now = new Date();
  const set: Record<string, unknown> = { updatedAt: now };
  if (patch.subject !== undefined) set.subject = patch.subject?.trim().slice(0, 100) || null;
  if (patch.note !== undefined) set.note = patch.note?.trim().slice(0, 2000) || null;
  if (patch.courseId !== undefined) {
    if (patch.courseId) {
      const cid = toObjectId(patch.courseId);
      const course = await col<CourseDoc>(db, "courses").findOne({ _id: cid, userId: uid } as never);
      if (!course) return { ok: false as const, reason: "bad_course" as const };
      set.courseId = cid;
    } else {
      set.courseId = null;
    }
  }
  if (action === "pause") {
    if (row.status !== "active" || row.pauseStartedAt) {
      return { ok: false as const, reason: "bad_transition" as const };
    }
    set.status = "paused";
    set.pauseStartedAt = now;
  } else if (action === "resume") {
    if (row.status !== "paused" || !row.pauseStartedAt) {
      return { ok: false as const, reason: "bad_transition" as const };
    }
    set.status = "active";
    set.pauseStartedAt = null;
    set.pausedSeconds = row.pausedSeconds + Math.floor((now.getTime() - row.pauseStartedAt.getTime()) / 1000);
  } else if (action === "finish" || action === "cancel") {
    if (row.status !== "active" && row.status !== "paused") {
      return { ok: false as const, reason: "bad_transition" as const };
    }
    let paused = row.pausedSeconds;
    if (row.status === "paused" && row.pauseStartedAt) {
      paused += Math.floor((now.getTime() - row.pauseStartedAt.getTime()) / 1000);
    }
    set.status = action === "finish" ? "completed" : "cancelled";
    set.pausedSeconds = paused;
    set.pauseStartedAt = null;
    set.endedAt = now;
  }
  await col<StudySessionDoc>(db, "studySessions").updateOne({ _id: sid, userId: uid } as never, { $set: set });
  return { ok: true as const };
}

/* ------------------------------- Analytics ----------------------------- */

export interface AnalyticsRange { days: 7 | 14 | 30 }

export async function getAnalytics(db: Db, userId: string | ObjectId, days: 7 | 14 | 30) {
  const uid = toObjectId(userId);
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const [tasksCreated, tasksCompleted, assignments, sessions, goals, habits, courses] = await Promise.all([
    col(db, "tasks").countDocuments({ userId: uid, createdAt: { $gte: since } } as never),
    col(db, "tasks").countDocuments({ userId: uid, completedAt: { $gte: since } } as never),
    col(db, "assignments").find({ userId: uid } as never).project({ status: 1, completedAt: 1, courseId: 1 }).toArray(),
    col(db, "studySessions").find({ userId: uid, startedAt: { $gte: since } } as never).toArray(),
    col(db, "goals").find({ userId: uid } as never).project({ status: 1 }).toArray(),
    col(db, "habits").find({ userId: uid, isActive: true } as never).toArray(),
    col(db, "courses").find({ userId: uid } as never).project({ name: 1, color: 1 }).toArray(),
  ]);

  const assignmentsCompleted = assignments.filter(
    (a) => a.status === "completed" && a.completedAt && new Date(a.completedAt) >= since
  ).length;
  const assignmentsOpen = assignments.filter((a) => a.status !== "completed").length;

  // Study time: completed sessions fully counted; open sessions counted to now.
  const now = new Date();
  let studySeconds = 0;
  const byCourse = new Map<string, number>();
  const perDay = new Map<string, number>();
  const courseName = new Map(courses.map((c) => [c._id.toHexString(), { name: c.name as string, color: c.color as string }]));
  for (const raw of sessions as StudySessionDoc[]) {
    if (raw.status === "cancelled") continue;
    const secs = Math.floor(sessionEffectiveMs(raw, now) / 1000);
    studySeconds += secs;
    const key = raw.courseId ? raw.courseId.toHexString() : "uncategorized";
    byCourse.set(key, (byCourse.get(key) ?? 0) + secs);
    const dk = dayKey(raw.startedAt);
    perDay.set(dk, (perDay.get(dk) ?? 0) + secs);
  }

  const daily: Array<{ date: string; study_seconds: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    daily.push({ date: k, study_seconds: perDay.get(k) ?? 0 });
  }

  const studyByCourse = [...byCourse.entries()]
    .map(([courseId, seconds]) => ({
      course_id: courseId === "uncategorized" ? null : courseId,
      name: courseId === "uncategorized" ? "Uncategorized" : (courseName.get(courseId)?.name ?? "Course"),
      color: courseId === "uncategorized" ? "slate" : (courseName.get(courseId)?.color ?? "slate"),
      study_seconds: seconds,
    }))
    .sort((a, b) => b.study_seconds - a.study_seconds || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, 8);

  // Habit consistency: completions vs expected slots in range.
  const habitIds = habits.map((h) => h._id);
  let habitCompletions = 0;
  let habitExpected = 0;
  if (habitIds.length > 0) {
    const logs = await col(db, "habitLogs")
      .find({ userId: uid, habitId: { $in: habitIds }, date: { $gte: dayKey(since) } } as never)
      .toArray();
    habitCompletions = logs.length;
    for (const h of habits) {
      const target = Math.min(Math.max(Number(h.target ?? 1), 1), 100);
      habitExpected += h.frequency === "daily" ? days * 1 : Math.max(Math.round((days / 7) * target), target > 0 ? 1 : 0);
    }
  }

  // Course workload: open items per course.
  const openTasks = await col(db, "tasks")
    .aggregate([{ $match: { userId: uid, completedAt: null } }, { $group: { _id: "$courseId", n: { $sum: 1 } } }])
    .toArray();
  const openAssign = await col(db, "assignments")
    .aggregate([{ $match: { userId: uid, status: { $ne: "completed" } } }, { $group: { _id: "$courseId", n: { $sum: 1 } } }])
    .toArray();
  const upcomingExams = await col(db, "exams")
    .aggregate([{ $match: { userId: uid, status: "scheduled", date: { $gte: new Date() } } }, { $group: { _id: "$courseId", n: { $sum: 1 } } }])
    .toArray();
  const countMap = new Map<string, { tasks: number; assignments: number; exams: number }>();
  const bump = (id: unknown, k: "tasks" | "assignments" | "exams", n: number) => {
    const key = id ? String(id) : "uncategorized";
    const cur = countMap.get(key) ?? { tasks: 0, assignments: 0, exams: 0 };
    cur[k] += n as number;
    countMap.set(key, cur);
  };
  for (const r of openTasks) bump(r._id, "tasks", r.n as number);
  for (const r of openAssign) bump(r._id, "assignments", r.n as number);
  for (const r of upcomingExams) bump(r._id, "exams", r.n as number);
  const workload = [...countMap.entries()]
    .map(([courseId, c]) => ({
      course_id: courseId === "uncategorized" ? null : courseId,
      name: courseId === "uncategorized" ? "Uncategorized" : (courseName.get(courseId)?.name ?? "Course"),
      color: courseId === "uncategorized" ? "slate" : (courseName.get(courseId)?.color ?? "slate"),
      open_tasks: c.tasks,
      open_assignments: c.assignments,
      upcoming_exams: c.exams,
    }))
    .sort((a, b) => (b.open_tasks + b.open_assignments + b.upcoming_exams) - (a.open_tasks + a.open_assignments + a.upcoming_exams) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, 8);

  return {
    range_days: days,
    since: since.toISOString(),
    tasks: {
      created: tasksCreated,
      completed: tasksCompleted,
      completion_rate: tasksCreated > 0 ? Math.round((tasksCompleted / tasksCreated) * 100) : null,
    },
    assignments: {
      completed: assignmentsCompleted,
      open: assignmentsOpen,
      total: assignments.length,
    },
    study: {
      total_seconds: studySeconds,
      by_course: studyByCourse,
      daily,
    },
    goals: {
      active: goals.filter((g) => g.status === "active").length,
      completed: goals.filter((g) => g.status === "completed").length,
      total: goals.length,
    },
    habits: {
      completions: habitCompletions,
      expected: habitExpected,
      consistency_rate: habitExpected > 0 ? Math.round((habitCompletions / habitExpected) * 100) : null,
      active_count: habits.length,
    },
    workload,
  };
}
