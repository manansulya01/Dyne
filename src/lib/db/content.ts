import { Db, ObjectId } from "mongodb";
import { col, type BlogDoc, type AnnouncementDoc, type TimetableEntryDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serialize, serializeMany } from "./serialize";
import { safeLimit, slugify } from "@/lib/utils";

/* ---------- Blogs ---------- */

export async function createBlog(db: Db, authorId: string | ObjectId, input: {
  title: string; slug?: string; excerpt?: string; content: string;
  coverImageUrl?: string; category?: string; isPublished?: boolean; isFeatured?: boolean;
}) {
  const slug = (input.slug?.trim() || slugify(input.title)).slice(0, 100) || `post-${Date.now()}`;
  const now = new Date();
  const published = !!input.isPublished;
  try {
    const res = await col<BlogDoc>(db, "blogs").insertOne({
      slug,
      title: input.title.trim(),
      excerpt: input.excerpt?.trim() || (input.content.slice(0, 180) + (input.content.length > 180 ? "…" : "")),
      content: input.content,
      coverImageUrl: input.coverImageUrl || null,
      category: input.category?.trim() || null,
      authorId: toObjectId(authorId),
      isPublished: published,
      isFeatured: !!input.isFeatured,
      publishedAt: published ? now : null,
      createdAt: now,
      updatedAt: now,
    } as never);
    return { ok: true as const, blogId: res.insertedId };
  } catch (err: unknown) {
    if (err instanceof Error && /duplicate key/i.test(err.message)) return { ok: false as const, reason: "slug_taken" as const };
    throw err;
  }
}

export async function listBlogs(db: Db, opts: { category?: string; featuredOnly?: boolean; includeDrafts?: boolean; limit?: number; before?: Date } = {}) {
  const q: Record<string, unknown> = {};
  if (!opts.includeDrafts) q.isPublished = true;
  if (opts.category) q.category = opts.category;
  if (opts.featuredOnly) q.isFeatured = true;
  if (opts.before) q.publishedAt = { $lt: opts.before };
  const rows = await col<BlogDoc>(db, "blogs").find(q as never).sort({ publishedAt: -1, createdAt: -1 }).limit(safeLimit(opts.limit, 50)).toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.authorId));
  return serializeMany(rows.map((r) => ({ ...r, author: authors.get(r.authorId.toHexString()) ?? null })));
}

export async function getBlogBySlug(db: Db, slug: string, includeDrafts = false) {
  const row = await col<BlogDoc>(db, "blogs").findOne({ slug } as never);
  if (!row) return null;
  if (!includeDrafts && !row.isPublished) return null;
  const authors = await resolveAuthors(db, [row.authorId]);
  return serialize({ ...row, author: authors.get(row.authorId.toHexString()) ?? null });
}

export async function updateBlog(db: Db, id: string | ObjectId, patch: Partial<{ title: string; excerpt: string | null; content: string; coverImageUrl: string | null; category: string | null; isPublished: boolean; isFeatured: boolean }>) {
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v;
  if (patch.isPublished === true) update.publishedAt = new Date();
  await col<BlogDoc>(db, "blogs").updateOne({ _id: toObjectId(id) } as never, { $set: update });
  return { ok: true as const };
}

export async function deleteBlog(db: Db, id: string | ObjectId) {
  await col<BlogDoc>(db, "blogs").deleteOne({ _id: toObjectId(id) } as never);
  return { ok: true as const };
}

/* ---------- Announcements ---------- */

export async function createAnnouncement(db: Db, createdBy: string | ObjectId, input: { title: string; body: string; category?: string; audience?: string; isPinned?: boolean; startsAt?: string; endsAt?: string }) {
  const now = new Date();
  const res = await col<AnnouncementDoc>(db, "announcements").insertOne({
    title: input.title.trim(),
    body: input.body,
    category: input.category?.trim() || null,
    audience: (input.audience as AnnouncementDoc["audience"]) ?? "all",
    isPinned: !!input.isPinned,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    createdBy: toObjectId(createdBy),
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, announcementId: res.insertedId };
}

export async function listAnnouncements(db: Db, opts: { limit?: number; pinnedFirst?: boolean } = {}) {
  const now = new Date();
  const rows = await col<AnnouncementDoc>(db, "announcements").find({
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  } as never).sort(opts.pinnedFirst === false ? { createdAt: -1 } : { isPinned: -1, createdAt: -1 }).limit(safeLimit(opts.limit, 50)).toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.createdBy));
  return serializeMany(rows.map((r) => ({ ...r, author: authors.get(r.createdBy.toHexString()) ?? null })));
}

/* ---------- Timetable ---------- */

export async function upsertTimetableEntry(db: Db, createdBy: string | ObjectId, input: {
  dayOfWeek: number; periodIndex: number; startTime: string; endTime: string;
  subject: string; room?: string; teacher?: string; classGrade?: string;
}) {
  const now = new Date();
  const filter = { dayOfWeek: input.dayOfWeek, periodIndex: input.periodIndex, classGrade: input.classGrade?.trim() || null } as never;
  const doc = {
    dayOfWeek: input.dayOfWeek,
    periodIndex: input.periodIndex,
    startTime: input.startTime,
    endTime: input.endTime,
    subject: input.subject.trim(),
    room: input.room?.trim() || null,
    teacher: input.teacher?.trim() || null,
    classGrade: input.classGrade?.trim() || null,
    createdBy: toObjectId(createdBy),
    updatedAt: now,
  };
  const res = await col<TimetableEntryDoc>(db, "timetableEntries").updateOne(filter, { $set: doc, $setOnInsert: { createdAt: now } }, { upsert: true });
  return { ok: true as const, upserted: res.upsertedCount > 0 };
}

export async function listTimetable(db: Db, classGrade?: string) {
  const q: Record<string, unknown> = {};
  if (classGrade) q.classGrade = { $in: [classGrade, null] };
  const rows = await col<TimetableEntryDoc>(db, "timetableEntries").find(q as never).sort({ dayOfWeek: 1, periodIndex: 1 }).limit(200).toArray();
  return serializeMany(rows);
}

export async function clearTimetable(db: Db, classGrade?: string) {
  const q: Record<string, unknown> = {};
  if (classGrade) q.classGrade = classGrade;
  await col<TimetableEntryDoc>(db, "timetableEntries").deleteMany(q as never);
  return { ok: true as const };
}
