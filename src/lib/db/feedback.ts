import { Db, ObjectId } from "mongodb";
import { col, type FeedbackDoc, type FeedbackStatus, type FeedbackPriority, type FeedbackCategory } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";

export async function createFeedback(
  db: Db,
  reporterId: string | ObjectId,
  input: { title: string; description: string; category: FeedbackCategory; page?: string | null }
) {
  const now = new Date();
  const res = await col<FeedbackDoc>(db, "feedback").insertOne({
    reporterId: toObjectId(reporterId),
    title: input.title.trim().slice(0, 200),
    description: input.description.trim().slice(0, 5000),
    category: input.category,
    page: input.page?.slice(0, 500) || null,
    status: "NEW" as FeedbackStatus,
    priority: "medium" as FeedbackPriority,
    adminResponse: null,
    internalNotes: null,
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, feedbackId: res.insertedId };
}

export async function listFeedback(
  db: Db,
  viewerId: string | ObjectId,
  viewerRole: string,
  opts: {
    status?: FeedbackStatus;
    category?: FeedbackCategory;
    search?: string;
    limit?: number;
    before?: Date;
    sort?: "newest" | "oldest";
  } = {}
) {
  const isStaff = ["moderator", "admin", "super_admin", "staff", "teacher"].includes(viewerRole);
  const filter: Record<string, unknown> = {};
  if (!isStaff) filter.reporterId = toObjectId(viewerId);
  if (opts.status) filter.status = opts.status;
  if (opts.category) filter.category = opts.category;
  if (opts.before) filter.createdAt = { $lt: opts.before };
  if (opts.search) {
    const rx = { $regex: opts.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ title: rx }, { description: rx }];
  }
  const sort: Record<string, 1 | -1> =
    opts.sort === "oldest" ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 };
  const rows = await col<FeedbackDoc>(db, "feedback")
    .find(filter as never)
    .sort(sort)
    .limit(safeLimit(opts.limit, 50))
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.reporterId));
  return {
    // Internal notes are NEVER exposed to ordinary users.
    items: serializeMany(
      rows.map((r) => ({
        ...r,
        reporter: authors.get(r.reporterId.toHexString()) ?? null,
        internalNotes: isStaff ? r.internalNotes : undefined,
      }))
    ),
    isStaff,
  };
}

export async function updateFeedbackAdmin(
  db: Db,
  feedbackId: string | ObjectId,
  actorRole: string,
  input: { status?: FeedbackStatus; priority?: FeedbackPriority; adminResponse?: string | null; internalNotes?: string | null }
) {
  if (!["moderator", "admin", "super_admin", "staff", "teacher"].includes(actorRole)) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const fid = toObjectId(feedbackId);
  const row = await col<FeedbackDoc>(db, "feedback").findOne({ _id: fid } as never);
  if (!row) return { ok: false as const, reason: "not_found" as const };
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.status) patch.status = input.status;
  if (input.priority) patch.priority = input.priority;
  if (input.adminResponse !== undefined) patch.adminResponse = input.adminResponse?.slice(0, 5000) || null;
  if (input.internalNotes !== undefined) patch.internalNotes = input.internalNotes?.slice(0, 5000) || null;
  await col<FeedbackDoc>(db, "feedback").updateOne({ _id: fid } as never, { $set: patch });
  return { ok: true as const };
}
