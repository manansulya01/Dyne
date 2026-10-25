import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type PendingMediaDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import {
  buildKey,
  isStorageBucket,
  sniffMismatch,
  validateUpload,
} from "@/lib/storage/types";
import { getStorageDriver } from "@/lib/storage/index";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { readFormData } from "@/lib/utils";
import { rateLimit, clientKey, RATE_PRESETS } from "@/lib/security/rateLimit";
import { canUploadStudyMaterials, hasAnyPermission, type Permission } from "@/lib/permissions";
import type { UserRole } from "@/types";

/**
 * Buckets that back staff-owned features.
 *
 * Uploading a file is not the same as publishing it: the create endpoints
 * (reels, videos, study materials) still authorize separately. But without a
 * bucket gate any student could flood the staff buckets with unreferenced
 * bytes, so those buckets require the matching capability up front.
 */
const STAFF_BUCKETS: Partial<Record<string, Permission[]>> = {
  "watch-videos": ["videos.create", "videos.edit"],
  "reel-videos": ["reels.create", "reels.edit"],
  "video-thumbnails": ["videos.create", "videos.edit", "reels.create", "reels.edit"],
  "study-materials": ["study.upload", "study.manage"],
};

export async function POST(request: Request) {
  // Database/configuration failures happen before storage is reached. Keep
  // them distinguishable in server logs instead of returning an opaque
  // framework-generated 500 with no safe diagnostic context.
  let db;
  try {
    db = await getDb();
    await ensureIndexes(db);
  } catch (err) {
    const cause = err instanceof Error ? err : undefined;
    const coded = err && typeof err === "object" ? err as { name?: unknown; code?: unknown } : undefined;
    console.error("[upload] database initialization failed", {
      errorName: typeof coded?.name === "string" ? coded.name : cause?.name ?? "UnknownError",
      errorCode: typeof coded?.code === "string" || typeof coded?.code === "number" ? coded.code : undefined,
    });
    return NextResponse.json(
      { error: "Upload service is temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }

  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const rl = rateLimit(`uploads:${clientKey(request, user.id)}`, RATE_PRESETS.uploads.limit, RATE_PRESETS.uploads.windowMs);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429 });
  }

  const formData = await readFormData(request);
  if (!formData) {
    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  }
  const file = formData.get("file");
  const rawBucket = formData.get("bucket");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const bucket = typeof rawBucket === "string" && rawBucket ? rawBucket : "post-media";
  if (!isStorageBucket(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }
  if (bucket === "study-materials" && !canUploadStudyMaterials(user.role as UserRole)) {
    return NextResponse.json({ error: "Only teachers can upload study materials" }, { status: 403 });
  }
  const required = STAFF_BUCKETS[bucket];
  if (required && bucket !== "study-materials" && !hasAnyPermission(user.role as UserRole, required)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let checked;
  try {
    checked = validateUpload(bucket, file.type, file.size, file.name);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid file" },
      { status: 400 }
    );
  }

  const key = buildKey(
    toObjectId(user.id).toHexString(),
    randomUUID().replace(/-/g, ""),
    checked.extension
  );
  const bytes = new Uint8Array(await file.arrayBuffer());

  // The browser MIME is attacker-controlled: verify the bytes actually match
  // the claimed format before anything is written to storage.
  const sniffError = sniffMismatch(checked.mime, bytes);
  if (sniffError) {
    return NextResponse.json({ error: sniffError }, { status: 400 });
  }

  const storage = getStorageDriver();
  let storedObject: { url: string };
  try {
    storedObject = await storage.put(bucket, key, bytes, checked.mime);
  } catch (err) {
    // Keep the client response generic, but retain safe diagnostics in the
    // server log so production storage failures can be distinguished from
    // request validation and database failures. Never log credentials, file
    // contents, cookies, or the original request.
    const cause = err instanceof Error ? err : undefined;
    const coded = err && typeof err === "object" ? err as { name?: unknown; $metadata?: { httpStatusCode?: unknown }; Code?: unknown; code?: unknown } : undefined;
    console.error("[upload] storage write failed", {
      bucket,
      errorName: typeof coded?.name === "string" ? coded.name : cause?.name ?? "UnknownError",
      storageCode: typeof coded?.Code === "string" ? coded.Code : typeof coded?.code === "string" ? coded.code : undefined,
      statusCode: typeof coded?.$metadata?.httpStatusCode === "number" ? coded.$metadata.httpStatusCode : undefined,
    });
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }

  // Real video is "video", images are "image", and documents/plain text are
  // "file" (previously anything non-video was mislabeled an image).
  const mediaType: "image" | "video" | "file" = checked.mime.startsWith("video/")
    ? "video"
    : checked.mime.startsWith("image/")
      ? "image"
      : "file";
  const url = storedObject.url;
  let storedId: string;
  try {
    const stored = await col<PendingMediaDoc>(db, "pendingMedia").insertOne({
      uploaderId: toObjectId(user.id),
      bucket,
      key,
      url,
      mediaType,
      thumbnailUrl: mediaType === "video" ? url : null,
      mime: checked.mime,
      originalName: file.name.slice(0, 200),
      size: file.size,
      createdAt: new Date(),
    } as never);
    storedId = stored.insertedId.toHexString();
  } catch (err) {
    const cause = err instanceof Error ? err : undefined;
    console.error("[upload] metadata persistence failed", {
      bucket,
      errorName: cause?.name ?? "UnknownError",
    });
    // The object is not useful until its pending-media row exists. Attempt
    // to roll it back so transient database errors do not leak stored files.
    try {
      await storage.delete(bucket, key);
    } catch (cleanupErr) {
      const cleanupCause = cleanupErr instanceof Error ? cleanupErr : undefined;
      console.error("[upload] orphan cleanup failed", {
        bucket,
        errorName: cleanupCause?.name ?? "UnknownError",
      });
    }
    return NextResponse.json(
      { error: "Upload service is temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }

  const hex = storedId;
  return NextResponse.json({
    media: {
      id: hex,
      post_id: null,
      media_type: mediaType,
      url,
      thumbnail_url: mediaType === "video" ? url : null,
      order_index: 0,
      uploaded_by: user.id,
      bucket,
      key,
      created_at: new Date().toISOString(),
    },
  });
}

export async function DELETE(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const { searchParams } = new URL(request.url);
  const mediaId = searchParams.get("mediaId");
  const rawBucket = searchParams.get("bucket") || "post-media";

  if (!mediaId || !objectIdSchema.safeParse(mediaId).success) {
    return NextResponse.json({ error: "No media ID provided" }, { status: 400 });
  }
  if (!isStorageBucket(rawBucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  const staged = await col<PendingMediaDoc>(db, "pendingMedia").findOne({
    _id: toObjectId(mediaId),
  } as never);

  if (!staged) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
  if (!staged.uploaderId.equals(toObjectId(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isStorageBucket(staged.bucket)) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  try {
    await getStorageDriver().delete(staged.bucket, staged.key);
  } catch {
    // Storage delete is best-effort; the staged record is still removed so
    // failed deletes cannot pin orphan rows.
  }
  await col<PendingMediaDoc>(db, "pendingMedia").deleteOne({ _id: staged._id } as never);
  return NextResponse.json({ success: true });
}
