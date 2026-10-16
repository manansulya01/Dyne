import { Db, ObjectId } from "mongodb";
import {
  col,
  type AssignmentDoc,
  type AssignmentStatus,
  type CourseDoc,
  type ExamDoc,
  type ExamStatus,
  type NoteDoc,
  type TaskDoc,
  type TaskPriority,
} from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { serialize, serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";

export interface CourseBrief { id: string; name: string; color: string }

/** Batch-resolve course briefs (avoids N+1 across task/assignment/exam/note lists). */
export async function resolveCourseBriefs(
  db: Db,
  userId: string | ObjectId,
  courseIds: Array<string | ObjectId | null | undefined>
): Promise<Map<string, CourseBrief>> {
  const uniq = [...new Set(
    courseIds.filter((c): c is string | ObjectId => !!c).map((c) => toObjectId(c).toHexString())
  )];
  const out = new Map<string, CourseBrief>();
  if (uniq.length === 0) return out;
  const rows = await col<CourseDoc>(db, "courses")
    .find({ _id: { $in: uniq.map((id) => new ObjectId(id)) }, userId: toObjectId(userId) } as never)
    .project({ name: 1, color: 1 })
    .toArray();
  for (const r of rows) {
    out.set(r._id.toHexString(), { id: r._id.toHexString(), name: r.name, color: r.color });
  }
  return out;
}

/** Assert a course belongs to the user (null passes through as "no course"). */
async function assertOwnCourse(
  db: Db,
  userId: ObjectId,
  courseId: string | ObjectId | null | undefined
): Promise<ObjectId | null> {
  if (!courseId) return null;
  const cid = toObjectId(courseId);
  const row = await col<CourseDoc>(db, "courses").findOne({ _id: cid, userId } as never);
  if (!row) throw Object.assign(new Error("Course not found"), { status: 404 });
  return cid;
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ------------------------------- Courses ------------------------------- */

export interface CourseInput {
  name: string;
  code?: string | null;
  instructor?: string | null;
  color?: string;
  room?: string | null;
  description?: string | null;
  semester?: string | null;
  schedule?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
}

export async function createCourse(db: Db, userId: string | ObjectId, input: CourseInput) {
  const uid = toObjectId(userId);
  const now = new Date();
  const res = await col<CourseDoc>(db, "courses").insertOne({
    userId: uid,
    name: input.name.trim(),
    code: input.code?.trim() || null,
    instructor: input.instructor?.trim() || null,
    color: input.color ?? "green",
    room: input.room?.trim() || null,
    description: input.description?.trim() || null,
    semester: input.semester?.trim() || null,
    schedule: (input.schedule ?? []).slice(0, 20),
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, courseId: res.insertedId };
}

export async function listCourses(db: Db, userId: string | ObjectId, limit = 50) {
  const uid = toObjectId(userId);
  const rows = await col<CourseDoc>(db, "courses")
    .find({ userId: uid } as never)
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit(limit, 100))
    .toArray();
  return serializeMany(rows);
}

export async function getCourse(db: Db, userId: string | ObjectId, courseId: string | ObjectId) {
  const row = await col<CourseDoc>(db, "courses").findOne({
    _id: toObjectId(courseId),
    userId: toObjectId(userId),
  } as never);
  return row ? serialize(row) : null;
}

export async function updateCourse(
  db: Db,
  userId: string | ObjectId,
  courseId: string | ObjectId,
  patch: Partial<CourseInput>
) {
  const uid = toObjectId(userId);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return { ok: false as const, reason: "bad_name" as const };
    set.name = patch.name.trim();
  }
  for (const k of ["code", "instructor", "room", "description", "semester"] as const) {
    if (patch[k] !== undefined) set[k] = patch[k]?.trim() || null;
  }
  if (patch.color !== undefined) set.color = patch.color;
  if (patch.schedule !== undefined) set.schedule = patch.schedule.slice(0, 20);
  const res = await col<CourseDoc>(db, "courses").updateOne(
    { _id: toObjectId(courseId), userId: uid } as never,
    { $set: set }
  );
  return res.matchedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

export async function deleteCourse(db: Db, userId: string | ObjectId, courseId: string | ObjectId) {
  const uid = toObjectId(userId);
  const cid = toObjectId(courseId);
  const res = await col<CourseDoc>(db, "courses").deleteOne({ _id: cid, userId: uid } as never);
  if (res.deletedCount === 0) return { ok: false as const, reason: "not_found" as const };
  // Detach (never cascade-delete user work): linked docs keep existing with courseId nulled.
  const now = new Date();
  for (const name of ["tasks", "assignments", "exams", "notes", "studySessions"] as const) {
    await col(db, name).updateMany(
      { userId: uid, courseId: cid } as never,
      { $set: { courseId: null, updatedAt: now } }
    );
  }
  return { ok: true as const };
}

/** Workload counts for one owned course (open tasks/assignments, upcoming exams, notes). */
export async function courseCounts(db: Db, userId: string | ObjectId, courseId: string | ObjectId) {
  const uid = toObjectId(userId);
  const cid = toObjectId(courseId);
  const match = { userId: uid, courseId: cid };
  const [openTasks, openAssignments, upcomingExams, notes] = await Promise.all([
    col<TaskDoc>(db, "tasks").countDocuments({ ...match, completedAt: null } as never),
    col<AssignmentDoc>(db, "assignments").countDocuments({ ...match, status: { $ne: "completed" } } as never),
    col<ExamDoc>(db, "exams").countDocuments({ ...match, status: "scheduled", date: { $gte: new Date() } } as never),
    col<NoteDoc>(db, "notes").countDocuments(match as never),
  ]);
  return { open_tasks: openTasks, open_assignments: openAssignments, upcoming_exams: upcomingExams, notes };
}

/* -------------------------------- Tasks -------------------------------- */

export interface TaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: Date | null;
  courseId?: string | ObjectId | null;
  tags?: string[];
}

export type TaskView = "today" | "upcoming" | "completed" | "all" | "overdue";

export interface TaskFilter {
  view?: TaskView;
  courseId?: string | ObjectId;
  priority?: TaskPriority;
  search?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  before?: Date;
}

function dayBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function createTask(db: Db, userId: string | ObjectId, input: TaskInput) {
  const uid = toObjectId(userId);
  const courseId = await assertOwnCourse(db, uid, input.courseId);
  const now = new Date();
  const res = await col<TaskDoc>(db, "tasks").insertOne({
    userId: uid,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    priority: input.priority ?? "medium",
    dueDate: input.dueDate ?? null,
    courseId,
    tags: (input.tags ?? []).map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 10),
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, taskId: res.insertedId };
}

export async function listTasks(db: Db, userId: string | ObjectId, filter: TaskFilter = {}) {
  const uid = toObjectId(userId);
  const q: Record<string, unknown> = { userId: uid };
  const view = filter.view ?? "all";
  const now = new Date();
  if (view === "completed") {
    q.completedAt = { $ne: null };
  } else {
    q.completedAt = null;
    if (view === "today") {
      const { start, end } = dayBounds(now);
      q.dueDate = { $gte: start, $lte: end };
    } else if (view === "upcoming") {
      const { end } = dayBounds(now);
      q.dueDate = { $gt: end };
    } else if (view === "overdue") {
      const { start } = dayBounds(now);
      q.dueDate = { $lt: start };
    }
  }
  if (filter.courseId) q.courseId = toObjectId(filter.courseId);
  if (filter.priority) q.priority = filter.priority;
  if (filter.search?.trim()) q.title = { $regex: esc(filter.search.trim()), $options: "i" };
  if (filter.from || filter.to) {
    const range: Record<string, Date> = {};
    if (filter.from) range.$gte = filter.from;
    if (filter.to) range.$lte = filter.to;
    q.dueDate = range;
  }
  if (filter.before) q.createdAt = { $lt: filter.before };
  const rows = await col<TaskDoc>(db, "tasks")
    .find(q as never)
    .sort(view === "completed" ? { completedAt: -1, _id: -1 } : { dueDate: 1, createdAt: -1, _id: -1 })
    .limit(safeLimit(filter.limit, 100))
    .toArray();
  const briefs = await resolveCourseBriefs(db, uid, rows.map((r) => r.courseId));
  return serializeMany(
    rows.map((r) => ({ ...r, course: r.courseId ? (briefs.get(r.courseId.toHexString()) ?? null) : null }))
  );
}

export async function getTask(db: Db, userId: string | ObjectId, taskId: string | ObjectId) {
  const uid = toObjectId(userId);
  const row = await col<TaskDoc>(db, "tasks").findOne({
    _id: toObjectId(taskId),
    userId: uid,
  } as never);
  if (!row) return null;
  const briefs = await resolveCourseBriefs(db, uid, [row.courseId]);
  return serialize({
    ...row,
    course: row.courseId ? (briefs.get(row.courseId.toHexString()) ?? null) : null,
  });
}

export async function updateTask(
  db: Db,
  userId: string | ObjectId,
  taskId: string | ObjectId,
  patch: Partial<TaskInput>
) {
  const uid = toObjectId(userId);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    if (!patch.title.trim() || patch.title.length > 200) return { ok: false as const, reason: "bad_title" as const };
    set.title = patch.title.trim();
  }
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.priority !== undefined) set.priority = patch.priority;
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate;
  if (patch.courseId !== undefined) {
    try {
      set.courseId = await assertOwnCourse(db, uid, patch.courseId);
    } catch {
      return { ok: false as const, reason: "bad_course" as const };
    }
  }
  if (patch.tags !== undefined) {
    set.tags = patch.tags.map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 10);
  }
  const res = await col<TaskDoc>(db, "tasks").updateOne(
    { _id: toObjectId(taskId), userId: uid } as never,
    { $set: set }
  );
  return res.matchedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

export async function completeTask(db: Db, userId: string | ObjectId, taskId: string | ObjectId, done: boolean) {
  const res = await col<TaskDoc>(db, "tasks").updateOne(
    { _id: toObjectId(taskId), userId: toObjectId(userId) } as never,
    { $set: { completedAt: done ? new Date() : null, updatedAt: new Date() } }
  );
  return res.matchedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

export async function deleteTask(db: Db, userId: string | ObjectId, taskId: string | ObjectId) {
  const res = await col<TaskDoc>(db, "tasks").deleteOne({
    _id: toObjectId(taskId),
    userId: toObjectId(userId),
  } as never);
  return res.deletedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

/* ----------------------------- Assignments ----------------------------- */

export interface AssignmentInput {
  title: string;
  description?: string | null;
  courseId?: string | ObjectId | null;
  dueDate?: Date | null;
  priority?: TaskPriority;
  status?: AssignmentStatus;
  progress?: number;
}

export interface AssignmentFilter {
  status?: AssignmentStatus | "open";
  courseId?: string | ObjectId;
  search?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  before?: Date;
}

export async function createAssignment(db: Db, userId: string | ObjectId, input: AssignmentInput) {
  const uid = toObjectId(userId);
  const courseId = await assertOwnCourse(db, uid, input.courseId);
  const now = new Date();
  const status = input.status ?? "not_started";
  const res = await col<AssignmentDoc>(db, "assignments").insertOne({
    userId: uid,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    courseId,
    dueDate: input.dueDate ?? null,
    priority: input.priority ?? "medium",
    status,
    progress: Math.min(Math.max(Math.round(input.progress ?? 0), 0), 100),
    completedAt: status === "completed" ? now : null,
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, assignmentId: res.insertedId };
}

export async function listAssignments(db: Db, userId: string | ObjectId, filter: AssignmentFilter = {}) {
  const uid = toObjectId(userId);
  const q: Record<string, unknown> = { userId: uid };
  if (filter.status === "open") q.status = { $ne: "completed" };
  else if (filter.status) q.status = filter.status;
  if (filter.courseId) q.courseId = toObjectId(filter.courseId);
  if (filter.search?.trim()) q.title = { $regex: esc(filter.search.trim()), $options: "i" };
  if (filter.from || filter.to) {
    const range: Record<string, Date> = {};
    if (filter.from) range.$gte = filter.from;
    if (filter.to) range.$lte = filter.to;
    q.dueDate = range;
  }
  if (filter.before) q.createdAt = { $lt: filter.before };
  const rows = await col<AssignmentDoc>(db, "assignments")
    .find(q as never)
    .sort({ dueDate: 1, createdAt: -1, _id: -1 })
    .limit(safeLimit(filter.limit, 100))
    .toArray();
  const briefs = await resolveCourseBriefs(db, uid, rows.map((r) => r.courseId));
  return serializeMany(
    rows.map((r) => ({ ...r, course: r.courseId ? (briefs.get(r.courseId.toHexString()) ?? null) : null }))
  );
}

export async function getAssignment(db: Db, userId: string | ObjectId, id: string | ObjectId) {
  const uid = toObjectId(userId);
  const row = await col<AssignmentDoc>(db, "assignments").findOne({
    _id: toObjectId(id),
    userId: uid,
  } as never);
  if (!row) return null;
  const briefs = await resolveCourseBriefs(db, uid, [row.courseId]);
  return serialize({
    ...row,
    course: row.courseId ? (briefs.get(row.courseId.toHexString()) ?? null) : null,
  });
}

export async function updateAssignment(
  db: Db,
  userId: string | ObjectId,
  id: string | ObjectId,
  patch: Partial<AssignmentInput>
) {
  const uid = toObjectId(userId);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    if (!patch.title.trim() || patch.title.length > 200) return { ok: false as const, reason: "bad_title" as const };
    set.title = patch.title.trim();
  }
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.courseId !== undefined) {
    try {
      set.courseId = await assertOwnCourse(db, uid, patch.courseId);
    } catch {
      return { ok: false as const, reason: "bad_course" as const };
    }
  }
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate;
  if (patch.priority !== undefined) set.priority = patch.priority;
  if (patch.progress !== undefined) set.progress = Math.min(Math.max(Math.round(patch.progress), 0), 100);
  if (patch.status !== undefined) {
    set.status = patch.status;
    if (patch.status === "completed") {
      set.completedAt = new Date();
      if (patch.progress === undefined) set.progress = 100;
    } else {
      set.completedAt = null;
    }
  }
  const res = await col<AssignmentDoc>(db, "assignments").updateOne(
    { _id: toObjectId(id), userId: uid } as never,
    { $set: set }
  );
  return res.matchedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

export async function deleteAssignment(db: Db, userId: string | ObjectId, id: string | ObjectId) {
  const res = await col<AssignmentDoc>(db, "assignments").deleteOne({
    _id: toObjectId(id),
    userId: toObjectId(userId),
  } as never);
  return res.deletedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

/* -------------------------------- Exams -------------------------------- */

export interface ExamInput {
  title: string;
  courseId?: string | ObjectId | null;
  date: Date;
  endTime?: Date | null;
  location?: string | null;
  topics?: string[];
  preparation?: number;
  notes?: string | null;
  status?: ExamStatus;
}

export interface ExamFilter {
  view?: "upcoming" | "past" | "all";
  courseId?: string | ObjectId;
  from?: Date;
  to?: Date;
  limit?: number;
}

export async function createExam(db: Db, userId: string | ObjectId, input: ExamInput) {
  const uid = toObjectId(userId);
  const courseId = await assertOwnCourse(db, uid, input.courseId);
  const now = new Date();
  const res = await col<ExamDoc>(db, "exams").insertOne({
    userId: uid,
    title: input.title.trim(),
    courseId,
    date: input.date,
    endTime: input.endTime ?? null,
    location: input.location?.trim() || null,
    topics: (input.topics ?? []).map((t) => t.trim().slice(0, 60)).filter(Boolean).slice(0, 20),
    preparation: Math.min(Math.max(Math.round(input.preparation ?? 0), 0), 100),
    notes: input.notes?.trim() || null,
    status: input.status ?? "scheduled",
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, examId: res.insertedId };
}

export async function listExams(db: Db, userId: string | ObjectId, filter: ExamFilter = {}) {
  const uid = toObjectId(userId);
  const view = filter.view ?? "all";
  const q: Record<string, unknown> = { userId: uid };
  if (view === "upcoming") {
    q.status = "scheduled";
    q.date = { $gte: new Date() };
  } else if (view === "past") {
    q.$or = [{ date: { $lt: new Date() } }, { status: { $in: ["completed", "cancelled"] } }];
  }
  if (filter.courseId) q.courseId = toObjectId(filter.courseId);
  if (filter.from || filter.to) {
    const range: Record<string, Date> = {};
    if (filter.from) range.$gte = filter.from;
    if (filter.to) range.$lte = filter.to;
    q.date = range;
  }
  const rows = await col<ExamDoc>(db, "exams")
    .find(q as never)
    .sort({ date: view === "past" ? -1 : 1, _id: view === "past" ? -1 : 1 })
    .limit(safeLimit(filter.limit, 100))
    .toArray();
  const briefs = await resolveCourseBriefs(db, uid, rows.map((r) => r.courseId));
  return serializeMany(
    rows.map((r) => ({ ...r, course: r.courseId ? (briefs.get(r.courseId.toHexString()) ?? null) : null }))
  );
}

/** The single next scheduled exam at/after now (dashboard countdown). */
export async function nextExam(db: Db, userId: string | ObjectId) {
  const uid = toObjectId(userId);
  const row = await col<ExamDoc>(db, "exams").findOne({
    userId: uid,
    status: "scheduled",
    date: { $gte: new Date() },
  } as never, { sort: { date: 1 } });
  if (!row) return null;
  const briefs = await resolveCourseBriefs(db, uid, [row.courseId]);
  return serialize({
    ...row,
    course: row.courseId ? (briefs.get(row.courseId.toHexString()) ?? null) : null,
  });
}

export async function getExam(db: Db, userId: string | ObjectId, id: string | ObjectId) {
  const uid = toObjectId(userId);
  const row = await col<ExamDoc>(db, "exams").findOne({
    _id: toObjectId(id),
    userId: uid,
  } as never);
  if (!row) return null;
  const briefs = await resolveCourseBriefs(db, uid, [row.courseId]);
  return serialize({
    ...row,
    course: row.courseId ? (briefs.get(row.courseId.toHexString()) ?? null) : null,
  });
}

export async function updateExam(
  db: Db,
  userId: string | ObjectId,
  id: string | ObjectId,
  patch: Partial<ExamInput>
) {
  const uid = toObjectId(userId);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    if (!patch.title.trim() || patch.title.length > 200) return { ok: false as const, reason: "bad_title" as const };
    set.title = patch.title.trim();
  }
  if (patch.courseId !== undefined) {
    try {
      set.courseId = await assertOwnCourse(db, uid, patch.courseId);
    } catch {
      return { ok: false as const, reason: "bad_course" as const };
    }
  }
  if (patch.date !== undefined) set.date = patch.date;
  if (patch.endTime !== undefined) set.endTime = patch.endTime;
  if (patch.location !== undefined) set.location = patch.location?.trim() || null;
  if (patch.topics !== undefined) {
    set.topics = patch.topics.map((t) => t.trim().slice(0, 60)).filter(Boolean).slice(0, 20);
  }
  if (patch.preparation !== undefined) set.preparation = Math.min(Math.max(Math.round(patch.preparation), 0), 100);
  if (patch.notes !== undefined) set.notes = patch.notes?.trim() || null;
  if (patch.status !== undefined) set.status = patch.status;
  const res = await col<ExamDoc>(db, "exams").updateOne(
    { _id: toObjectId(id), userId: uid } as never,
    { $set: set }
  );
  return res.matchedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

export async function deleteExam(db: Db, userId: string | ObjectId, id: string | ObjectId) {
  const res = await col<ExamDoc>(db, "exams").deleteOne({
    _id: toObjectId(id),
    userId: toObjectId(userId),
  } as never);
  return res.deletedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

/* -------------------------------- Notes -------------------------------- */

export interface NoteInput {
  title: string;
  body?: string;
  courseId?: string | ObjectId | null;
  tags?: string[];
}

export interface NoteFilter {
  search?: string;
  courseId?: string | ObjectId;
  tag?: string;
  limit?: number;
  before?: Date;
}

export async function createNote(db: Db, userId: string | ObjectId, input: NoteInput) {
  const uid = toObjectId(userId);
  const courseId = await assertOwnCourse(db, uid, input.courseId);
  const now = new Date();
  const res = await col<NoteDoc>(db, "notes").insertOne({
    userId: uid,
    title: input.title.trim(),
    body: (input.body ?? "").slice(0, 50000),
    courseId,
    tags: (input.tags ?? []).map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 10),
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, noteId: res.insertedId };
}

export async function listNotes(db: Db, userId: string | ObjectId, filter: NoteFilter = {}) {
  const uid = toObjectId(userId);
  const q: Record<string, unknown> = { userId: uid };
  if (filter.search?.trim()) {
    // Owner-scoped text search; falls back gracefully when the text index
    // is still building (never exposed outside the owner's queries).
    try {
      const rows = await col<NoteDoc>(db, "notes")
        .find({ ...q, $text: { $search: filter.search.trim().slice(0, 100) } } as never)
        .sort({ updatedAt: -1, _id: -1 })
        .limit(safeLimit(filter.limit, 100))
        .toArray();
      const briefs = await resolveCourseBriefs(db, uid, rows.map((r) => r.courseId));
      return serializeMany(
        rows.map((r) => ({ ...r, course: r.courseId ? (briefs.get(r.courseId.toHexString()) ?? null) : null }))
      );
    } catch {
      q.$or = [
        { title: { $regex: esc(filter.search.trim()), $options: "i" } },
        { body: { $regex: esc(filter.search.trim()), $options: "i" } },
      ];
    }
  }
  if (filter.courseId) q.courseId = toObjectId(filter.courseId);
  if (filter.tag) q.tags = filter.tag.slice(0, 30);
  if (filter.before) q.updatedAt = { $lt: filter.before };
  const rows = await col<NoteDoc>(db, "notes")
    .find(q as never)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(safeLimit(filter.limit, 100))
    .toArray();
  const briefs = await resolveCourseBriefs(db, uid, rows.map((r) => r.courseId));
  return serializeMany(
    rows.map((r) => ({ ...r, course: r.courseId ? (briefs.get(r.courseId.toHexString()) ?? null) : null }))
  );
}

export async function getNote(db: Db, userId: string | ObjectId, id: string | ObjectId) {
  const uid = toObjectId(userId);
  const row = await col<NoteDoc>(db, "notes").findOne({
    _id: toObjectId(id),
    userId: uid,
  } as never);
  if (!row) return null;
  const briefs = await resolveCourseBriefs(db, uid, [row.courseId]);
  return serialize({
    ...row,
    course: row.courseId ? (briefs.get(row.courseId.toHexString()) ?? null) : null,
  });
}

export async function updateNote(
  db: Db,
  userId: string | ObjectId,
  id: string | ObjectId,
  patch: Partial<NoteInput>
) {
  const uid = toObjectId(userId);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    if (!patch.title.trim() || patch.title.length > 200) return { ok: false as const, reason: "bad_title" as const };
    set.title = patch.title.trim();
  }
  if (patch.body !== undefined) set.body = patch.body.slice(0, 50000);
  if (patch.courseId !== undefined) {
    try {
      set.courseId = await assertOwnCourse(db, uid, patch.courseId);
    } catch {
      return { ok: false as const, reason: "bad_course" as const };
    }
  }
  if (patch.tags !== undefined) {
    set.tags = patch.tags.map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 10);
  }
  const res = await col<NoteDoc>(db, "notes").updateOne(
    { _id: toObjectId(id), userId: uid } as never,
    { $set: set }
  );
  return res.matchedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

export async function deleteNote(db: Db, userId: string | ObjectId, id: string | ObjectId) {
  const res = await col<NoteDoc>(db, "notes").deleteOne({
    _id: toObjectId(id),
    userId: toObjectId(userId),
  } as never);
  return res.deletedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}
