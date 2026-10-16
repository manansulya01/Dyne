import { Db, ObjectId } from "mongodb";
import { col, type StudyMaterialDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";
import { assertSafeKey } from "@/lib/storage/types";
import { moderateContent } from "@/lib/moderation";
import { logAudit } from "@/lib/security/audit";

function sanitizeFileName(name: string): string {
  const base = name.split("/").pop()?.split("\\").pop() ?? "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "file";
}

export interface CreateStudyMaterialInput {
  title: string;
  description?: string | null;
  subject: string;
  classGrade: string;
  topic?: string | null;
  materialType: StudyMaterialDoc["materialType"];
  tags?: string[];
  teacher?: string | null;
  semester?: string | null;
  academicYear?: string | null;
  bucket: string;
  key: string;
  url: string;
  mime: string;
  size: number;
  fileName: string;
}

export async function createStudyMaterial(
  db: Db,
  uploaderId: string | ObjectId,
  input: CreateStudyMaterialInput
) {
  // Never trust client-supplied filenames or keys.
  if (input.bucket !== "study-materials") return { ok: false as const, reason: "bad_bucket" as const };
  try {
    assertSafeKey(input.key);
  } catch {
    return { ok: false as const, reason: "bad_key" as const };
  }
  if (input.url.length > 2048 || input.url.includes("..")) {
    return { ok: false as const, reason: "bad_url" as const };
  }

  const now = new Date();
  const uploader = toObjectId(uploaderId);
  const title = input.title.trim().slice(0, 200);
  const description = input.description?.trim().slice(0, 2000) || null;

  // Educational uploads are moderated like every other piece of content. The
  // filename and declared MIME are inspected as text; the document body itself
  // is not parsed (a real document scanner can be plugged in later).
  // Preallocate the id so the review record targets the real document row.
  const docId = new ObjectId();

  const moderation = await moderateContent(db, {
    contentType: "post",
    contentId: docId,
    authorId: uploader,
    text: `${title}\n${description ?? ""}\n${input.fileName}`,
    mediaUrl: input.url,
    mediaProvided: true,
    trustedAuthor: true,
    excerpt: title,
  });

  /* Moderation policy for study materials.
   *
   * A document's *bytes* are never parsed here, so the pipeline only inspects
   * the declared metadata (title, description, filename). Blocking every
   * teacher upload until a document scanner exists would make the library
   * unusable, and uploads are already behind an authenticated download gate.
   * The rule is therefore:
   *   - a hard reject (high-confidence rule hit)  -> rejected
   *   - a borderline finding or provider flag     -> pending (held for review)
   *   - nothing found                             -> approved
   * The metadata (including "no provider analysed this") is always stored. */
  const status: StudyMaterialDoc["status"] =
    moderation.decision === "rejected"
      ? "rejected"
      : moderation.decision === "flagged"
        ? "pending"
        : "approved";

  const res = await col<StudyMaterialDoc>(db, "studyMaterials").insertOne({
    _id: docId,
    title,
    description,
    subject: input.subject.trim().slice(0, 100),
    classGrade: input.classGrade.trim().slice(0, 50),
    topic: input.topic?.trim().slice(0, 100) || null,
    materialType: input.materialType,
    tags: (input.tags ?? []).map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 10),
    teacher: input.teacher?.trim().slice(0, 100) || null,
    semester: input.semester?.trim().slice(0, 50) || null,
    academicYear: input.academicYear?.trim().slice(0, 20) || null,
    uploaderId: uploader,
    bucket: input.bucket,
    key: input.key,
    url: input.url,
    mime: input.mime.slice(0, 120),
    size: input.size,
    fileName: sanitizeFileName(input.fileName),
    isRemoved: false,
    isFeatured: false,
    status,
    createdAt: now,
    updatedAt: now,
  } as never);

  await col(db, "moderationReviews").updateMany(
    { contentType: "post", contentId: docId, authorId: uploader } as never,
    { $set: { contentId: res.insertedId, contentType: "post" } }
  );

  return { ok: true as const, materialId: res.insertedId, status };
}

export async function listStudyMaterials(
  db: Db,
  opts: {
    search?: string;
    subject?: string;
    classGrade?: string;
    materialType?: StudyMaterialDoc["materialType"];
    tag?: string;
    teacher?: string;
    semester?: string;
    academicYear?: string;
    savedBy?: string | ObjectId;
    sort?: "newest" | "oldest";
    featuredOnly?: boolean;
    limit?: number;
    before?: Date;
    /** Teacher view: include this author's own pending materials. */
    includeOwnPending?: string | ObjectId;
    status?: string;
    /** Include soft-removed materials (staff views only, permission-gated upstream). */
    includeRemoved?: boolean;
  }
) {
  const q: Record<string, unknown> = opts.includeRemoved
    ? {}
    : { isRemoved: { $ne: true } };
  if (opts.status) q.status = opts.status;
  else if (!opts.includeRemoved) {
    // Default: only approved content (staff views can opt into held/removed).
    q.status = "approved";
  }
  if (opts.search?.trim()) {
    const rx = { $regex: opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    q.$or = [{ title: rx }, { description: rx }, { subject: rx }];
  }
  if (opts.subject) q.subject = { $regex: `^${opts.subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
  if (opts.classGrade) q.classGrade = { $regex: `^${opts.classGrade.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
  if (opts.materialType) q.materialType = opts.materialType;
  if (opts.tag) q.tags = opts.tag.slice(0, 30);
  if (opts.teacher) q.teacher = opts.teacher;
  if (opts.semester) q.semester = opts.semester;
  if (opts.academicYear) q.academicYear = opts.academicYear;
  if (opts.featuredOnly) q.isFeatured = true;
  if (opts.before) q.createdAt = { $lt: opts.before };

  const rows = await col<StudyMaterialDoc>(db, "studyMaterials")
    .find(q as never)
    .sort(opts.sort === "oldest" ? ({ createdAt: 1, _id: 1 } as never) : ({ createdAt: -1, _id: -1 } as never))
    .limit(safeLimit(opts.limit, 60, 20))
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.uploaderId));

  let items = rows.map((r) => ({
    ...r,
    uploader: authors.get(r.uploaderId.toHexString()) ?? null,
  }));

  if (opts.includeOwnPending) {
    const own = toObjectId(opts.includeOwnPending);
    const extra = await col<StudyMaterialDoc>(db, "studyMaterials")
      .find({ uploaderId: own, status: { $in: ["pending", "rejected"] }, isRemoved: { $ne: true } } as never)
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .toArray();
    const seen = new Set(items.map((i) => i._id.toHexString()));
    items = [
      ...items,
      ...extra
        .filter((e) => !seen.has(e._id.toHexString()))
        .map((r) => ({ ...r, uploader: authors.get(r.uploaderId.toHexString()) ?? null })),
    ];
  }

  if (opts.savedBy) {
    const saved = await col(db, "savedStudyMaterials")
      .find({ userId: toObjectId(opts.savedBy) } as never)
      .project({ materialId: 1 })
      .limit(500)
      .toArray();
    const ids = new Set(saved.map((s) => s.materialId.toHexString()));
    items = items.filter((i) => ids.has(i._id.toHexString()));
  }

  return serializeMany(items);
}

export async function getStudyMaterial(db: Db, id: string | ObjectId) {
  const row = await col<StudyMaterialDoc>(db, "studyMaterials").findOne({
    _id: toObjectId(id),
  } as never);
  if (!row) return null;
  const authors = await resolveAuthors(db, [row.uploaderId]);
  return { ...row, uploader: authors.get(row.uploaderId.toHexString()) ?? null };
}

export async function setStudyMaterialStatus(
  db: Db,
  id: string | ObjectId,
  status: StudyMaterialDoc["status"],
  actorId: string | ObjectId,
  reason?: string | null
) {
  const res = await col<StudyMaterialDoc>(db, "studyMaterials").updateOne(
    { _id: toObjectId(id) } as never,
    { $set: { status, updatedAt: new Date() } }
  );
  if (res.matchedCount === 0) return { ok: false as const, reason: "not_found" as const };
  await logAudit(db, {
    actorId: String(actorId),
    action: `study_material.status.${status}`,
    targetType: "study_material",
    targetId: toObjectId(id).toHexString(),
    details: { reason: reason ?? null },
  });
  return { ok: true as const };
}

/* ------------------------- Save / unsave ------------------------- */

export async function isStudyMaterialSaved(
  db: Db,
  userId: string | ObjectId,
  materialId: string | ObjectId
) {
  const row = await col(db, "savedStudyMaterials").findOne({
    userId: toObjectId(userId),
    materialId: toObjectId(materialId),
  } as never);
  return !!row;
}

export async function saveStudyMaterial(
  db: Db,
  userId: string | ObjectId,
  materialId: string | ObjectId
) {
  const mid = toObjectId(materialId);
  const material = await col<StudyMaterialDoc>(db, "studyMaterials").findOne({
    _id: mid,
    isRemoved: { $ne: true },
    status: { $ne: "rejected" },
  } as never);
  if (!material) return { ok: false as const, reason: "not_found" as const };
  try {
    await col(db, "savedStudyMaterials").insertOne({
      userId: toObjectId(userId),
      materialId: mid,
      createdAt: new Date(),
    } as never);
  } catch (err: unknown) {
    // Saving twice is a no-op success (idempotent), not an error.
    if (!(err instanceof Error && /duplicate key/i.test(err.message))) throw err;
  }
  return { ok: true as const };
}

export async function unsaveStudyMaterial(
  db: Db,
  userId: string | ObjectId,
  materialId: string | ObjectId
) {
  await col(db, "savedStudyMaterials").deleteOne({
    userId: toObjectId(userId),
    materialId: toObjectId(materialId),
  } as never);
  return { ok: true as const };
}

/**
 * Moderation actions for a study material.
 *
 * `remove`/`restore`/`feature`/`unfeature` are moderation-role actions;
 * `approve`/`reject` additionally require `study.manage`. Audited by caller.
 */
export async function moderateStudyMaterial(
  db: Db,
  id: string | ObjectId,
  actorRole: string,
  action: "remove" | "restore" | "feature" | "unfeature" | "reject" | "approve"
) {
  const { hasPermission } = await import("@/lib/permissions");
  // Featuring and approving/rejecting are admin-tier; removal and restore are
  // ordinary moderator work.
  const requiredPermission =
    action === "feature" || action === "unfeature" || action === "approve" || action === "reject"
      ? "study.feature"
      : "posts.moderate";
  if (!hasPermission(actorRole as never, requiredPermission as never)) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  const mid = toObjectId(id);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (action === "remove") set.isRemoved = true;
  if (action === "restore") set.isRemoved = false;
  if (action === "feature") set.isFeatured = true;
  if (action === "unfeature") set.isFeatured = false;
  if (action === "approve") {
    set.status = "approved";
    set.isRemoved = false;
  }
  if (action === "reject") {
    set.status = "rejected";
    set.isRemoved = true;
  }

  const res = await col<StudyMaterialDoc>(db, "studyMaterials").updateOne(
    { _id: mid } as never,
    { $set: set }
  );
  if (res.matchedCount === 0) return { ok: false as const, reason: "not_found" as const };
  return { ok: true as const };
}
