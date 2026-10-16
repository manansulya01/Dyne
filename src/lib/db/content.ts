import { Db, ObjectId } from "mongodb";
import { col, type BlogDoc, type TimetableEntryDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serialize, serializeMany } from "./serialize";
import { safeLimit, slugify } from "@/lib/utils";
import { moderateContent } from "@/lib/moderation";

/* ---------- Blogs ---------- */

export interface CreateBlogInput {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  coverImageUrl?: string;
  category?: string;
  isPublished?: boolean;
  isFeatured?: boolean;
}

export interface CreateBlogResult {
  ok: true;
  blogId: ObjectId;
  moderationStatus: BlogDoc["moderationStatus"];
}

/**
 * Create a blog post.
 *
 * A post may only be `isPublished` when the moderation pipeline approves it:
 * high-confidence violations are rejected, borderline content is flagged and
 * held for review, and clean content publishes immediately. When no AI
 * provider is configured the post is created as a draft for manual review
 * rather than pretending it was vetted.
 */
export async function createBlog(
  db: Db,
  authorId: string | ObjectId,
  input: CreateBlogInput
): Promise<CreateBlogResult | { ok: false; reason: "slug_taken" }> {
  const slug = (input.slug?.trim() || slugify(input.title)).slice(0, 100) || `post-${Date.now()}`;
  const now = new Date();
  const author = toObjectId(authorId);

  // Reserve the slug first; a clash fails before any moderation work.
  const probe = await col<BlogDoc>(db, "blogs").findOne({ slug } as never);
  if (probe) return { ok: false, reason: "slug_taken" };

  // Preallocate the document id so the moderation review is recorded against
  // the exact row that will be inserted (no orphan review records).
  const docId = new ObjectId();

  const moderation = await moderateContent(db, {
    contentType: "blog",
    contentId: docId,
    authorId: author,
    text: `${input.title}\n${input.excerpt ?? ""}\n${input.content}`,
    mediaUrl: input.coverImageUrl || null,
    mediaProvided: !!input.coverImageUrl,
    trustedAuthor: true,
    excerpt: input.title,
  });

  // Cannot publish while pending/flagged, regardless of the requested flag.
  const requestedPublish = !!input.isPublished;
  const effectivePublished = requestedPublish && moderation.decision === "approved";
  const status: BlogDoc["moderationStatus"] =
    moderation.decision === "approved"
      ? "approved"
      : moderation.decision === "rejected"
        ? "rejected"
        : moderation.decision === "flagged"
          ? "flagged"
          : "pending";

  let res;
  try {
    res = await col<BlogDoc>(db, "blogs").insertOne({
      _id: docId,
      slug,
      title: input.title.trim(),
      excerpt:
        input.excerpt?.trim() ||
        (input.content.slice(0, 180) + (input.content.length > 180 ? "…" : "")),
      content: input.content,
      coverImageUrl: input.coverImageUrl || null,
      category: input.category?.trim() || null,
      authorId: author,
      isPublished: effectivePublished,
      isFeatured: effectivePublished ? !!input.isFeatured : false,
      publishedAt: effectivePublished ? now : null,
      moderationStatus: status,
      moderationReason: moderation.reason,
      moderationScore: moderation.score,
      moderationSource: moderation.source,
      moderationProvider: moderation.provider,
      moderationMediaAnalyzed: moderation.mediaAnalyzed,
      moderatedAt: now,
      createdAt: now,
      updatedAt: now,
    } as never);
  } catch (err: unknown) {
    if (err instanceof Error && /duplicate key/i.test(err.message)) {
      return { ok: false, reason: "slug_taken" };
    }
    throw err;
  }

  // The review already points at `docId`; no re-pointing is required.
  await col(db, "moderationReviews").updateMany(
    { contentType: "blog", contentId: docId, authorId: author } as never,
    { $set: { contentId: res.insertedId } }
  );

  return { ok: true, blogId: res.insertedId, moderationStatus: status };
}

export async function listBlogs(
  db: Db,
  opts: {
    category?: string;
    featuredOnly?: boolean;
    includeDrafts?: boolean;
    moderationStatus?: string;
    authorId?: string | ObjectId;
    limit?: number;
    before?: Date;
  } = {}
) {
  const q: Record<string, unknown> = {};
  if (!opts.includeDrafts) {
    q.isPublished = true;
    // Legacy rows predate moderation metadata; treat them as approved.
    q.$or = [{ moderationStatus: "approved" }, { moderationStatus: { $exists: false } }];
  }
  if (opts.category) q.category = opts.category;
  if (opts.featuredOnly) q.isFeatured = true;
  if (opts.moderationStatus) q.moderationStatus = opts.moderationStatus;
  if (opts.authorId) q.authorId = toObjectId(opts.authorId);
  if (opts.before) q.publishedAt = { $lt: opts.before };
  const rows = await col<BlogDoc>(db, "blogs")
    .find(q as never)
    .sort({ publishedAt: -1, createdAt: -1, _id: -1 })
    .limit(safeLimit(opts.limit, 50))
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.authorId));
  return serializeMany(
    rows.map((r) => ({ ...r, author: authors.get(r.authorId.toHexString()) ?? null }))
  );
}

export async function getBlogBySlug(db: Db, slug: string, includeDrafts = false) {
  const row = await col<BlogDoc>(db, "blogs").findOne({ slug } as never);
  if (!row) return null;
  if (!includeDrafts && !row.isPublished) return null;
  const authors = await resolveAuthors(db, [row.authorId]);
  return serialize({ ...row, author: authors.get(row.authorId.toHexString()) ?? null });
}

export async function getBlogById(db: Db, id: string | ObjectId) {
  const row = await col<BlogDoc>(db, "blogs").findOne({ _id: toObjectId(id) } as never);
  if (!row) return null;
  const authors = await resolveAuthors(db, [row.authorId]);
  return serialize({ ...row, author: authors.get(row.authorId.toHexString()) ?? null });
}

export async function updateBlog(
  db: Db,
  id: string | ObjectId,
  patch: Partial<{
    title: string;
    excerpt: string | null;
    content: string;
    coverImageUrl: string | null;
    category: string | null;
    isPublished: boolean;
    isFeatured: boolean;
  }>
) {
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v;
  if (patch.isPublished === true) {
    // Publishing requires an approved moderation status.
    const row = await col<BlogDoc>(db, "blogs").findOne({ _id: toObjectId(id) } as never);
    const status = row?.moderationStatus ?? (row ? "approved" : "rejected");
    if (status !== "approved") {
      return { ok: false as const, reason: "not_approved" as const };
    }
    update.publishedAt = new Date();
  }
  const res = await col<BlogDoc>(db, "blogs").updateOne({ _id: toObjectId(id) } as never, {
    $set: update,
  });
  if (res.matchedCount === 0) return { ok: false as const, reason: "not_found" as const };
  return { ok: true as const };
}

export async function deleteBlog(db: Db, id: string | ObjectId) {
  const bid = toObjectId(id);
  const res = await col<BlogDoc>(db, "blogs").deleteOne({ _id: bid } as never);
  if (res.deletedCount === 0) return { ok: false as const, reason: "not_found" as const };
  await col(db, "moderationReviews").deleteMany({ contentType: "blog", contentId: bid } as never);
  return { ok: true as const };
}

/* ---------- Timetable ---------- */

export async function upsertTimetableEntry(
  db: Db,
  createdBy: string | ObjectId,
  input: {
    dayOfWeek: number;
    periodIndex: number;
    startTime: string;
    endTime: string;
    subject: string;
    room?: string;
    teacher?: string;
    classGrade?: string;
  }
) {
  const now = new Date();
  const filter = {
    dayOfWeek: input.dayOfWeek,
    periodIndex: input.periodIndex,
    classGrade: input.classGrade?.trim() || null,
  } as never;
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
  const res = await col<TimetableEntryDoc>(db, "timetableEntries").updateOne(
    filter,
    { $set: doc, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  return { ok: true as const, upserted: res.upsertedCount > 0 };
}

export async function listTimetable(db: Db, classGrade?: string) {
  const q: Record<string, unknown> = {};
  if (classGrade) q.classGrade = { $in: [classGrade, null] };
  const rows = await col<TimetableEntryDoc>(db, "timetableEntries")
    .find(q as never)
    .sort({ dayOfWeek: 1, periodIndex: 1 })
    .limit(200)
    .toArray();
  return serializeMany(rows);
}

export async function clearTimetable(db: Db, classGrade?: string, dayOfWeek?: number) {
  const q: Record<string, unknown> = {};
  if (classGrade) q.classGrade = classGrade;
  if (dayOfWeek !== undefined) q.dayOfWeek = dayOfWeek;
  await col<TimetableEntryDoc>(db, "timetableEntries").deleteMany(q as never);
  return { ok: true as const };
}
