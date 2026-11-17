import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser, guardRate } from "@/lib/security/authorize";
import { canUploadStudyMaterials } from "@/lib/permissions";
import { assertSafeKey, sniffMismatch, validateUpload } from "@/lib/storage/types";
import { getStorageDriver } from "@/lib/storage";
import { R2StorageDriver } from "@/lib/storage/r2";
import { toObjectId } from "@/lib/mongo/ids";
import { ensureIndexes, col, type PendingMediaDoc } from "@/lib/mongo/collections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  bucket: z.literal("study-materials"),
  key: z.string().min(1).max(200),
  fileName: z.string().trim().min(1).max(200),
  mime: z.string().min(1).max(120),
  size: z.number().int().positive().max(50 * 1024 * 1024),
});

/** Finalizes an R2 upload only after the server verifies its actual object metadata and magic bytes. */
export async function POST(request: Request) {
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  if (!canUploadStudyMaterials(user.role)) {
    return NextResponse.json({ error: "Only teachers can upload study materials." }, { status: 403 });
  }
  const limited = guardRate(request, user.id, "uploads");
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { bucket, key, fileName, mime, size } = parsed.data;
  try {
    assertSafeKey(key);
    validateUpload(bucket, mime, size, fileName);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid upload" }, { status: 400 });
  }
  const ownerPrefix = toObjectId(user.id).toHexString() + "/";
  if (!key.startsWith(ownerPrefix)) return NextResponse.json({ error: "Invalid upload owner." }, { status: 403 });

  const storage = getStorageDriver();
  if (!(storage instanceof R2StorageDriver)) {
    return NextResponse.json({ error: "Direct upload is unavailable for this storage driver." }, { status: 409 });
  }

  let inspected;
  try {
    inspected = await storage.inspectUpload(bucket, key);
  } catch {
    return NextResponse.json({ error: "Uploaded file could not be verified. Please retry." }, { status: 400 });
  }
  if (inspected.size !== size || inspected.mime !== mime) {
    await storage.delete(bucket, key).catch(() => undefined);
    return NextResponse.json({ error: "Uploaded file metadata did not match the upload request." }, { status: 400 });
  }
  const mismatch = sniffMismatch(mime, inspected.prefix);
  if (mismatch) {
    await storage.delete(bucket, key).catch(() => undefined);
    return NextResponse.json({ error: mismatch }, { status: 400 });
  }

  await ensureIndexes(db);
  const url = storage.publicUrl(bucket, key);
  const mediaType: "image" | "video" | "file" = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "file";
  const inserted = await col<PendingMediaDoc>(db, "pendingMedia").insertOne({
    uploaderId: toObjectId(user.id),
    bucket,
    key,
    url,
    mediaType,
    thumbnailUrl: null,
    mime,
    originalName: fileName.slice(0, 200),
    size,
    createdAt: new Date(),
  } as never);
  return NextResponse.json({
    media: {
      id: inserted.insertedId.toHexString(),
      post_id: null,
      media_type: mediaType,
      url,
      thumbnail_url: null,
      order_index: 0,
      uploaded_by: user.id,
      bucket,
      key,
      created_at: new Date().toISOString(),
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
