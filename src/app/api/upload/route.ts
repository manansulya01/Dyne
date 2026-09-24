import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type PendingMediaDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import {
  buildKey,
  isStorageBucket,
  validateUpload,
} from "@/lib/storage/types";
import { getStorageDriver } from "@/lib/storage/index";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

export async function POST(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const rawBucket = formData.get("bucket");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const bucket = typeof rawBucket === "string" && rawBucket ? rawBucket : "post-media";
  if (!isStorageBucket(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
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

  try {
    await getStorageDriver().put(bucket, key, bytes, checked.mime);
  } catch {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }

  const mediaType = checked.mime.startsWith("video/") ? "video" : "image";
  const url = getStorageDriver().publicUrl(bucket, key);
  const stored = await col<PendingMediaDoc>(db, "pendingMedia").insertOne({
    uploaderId: toObjectId(user.id),
    bucket,
    key,
    url,
    mediaType,
    thumbnailUrl: mediaType === "video" ? url : null,
    createdAt: new Date(),
  } as never);

  const hex = stored.insertedId.toHexString();
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
