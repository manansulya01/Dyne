import { NextResponse } from "next/server";
import { z } from "zod";
import { withAnyPermission, guardRate } from "@/lib/security/authorize";
import { assertSafeKey, sniffMismatch, validateUpload } from "@/lib/storage/types";
import { getStorageDriver } from "@/lib/storage";
import { R2StorageDriver } from "@/lib/storage/r2";
import { toObjectId } from "@/lib/mongo/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  bucket: z.literal("post-media"),
  key: z.string().min(1).max(200),
  fileName: z.string().trim().min(1).max(200),
  mime: z.string().min(1).max(120),
  size: z.number().int().positive().max(50 * 1024 * 1024),
});

/** Verifies the uploaded object before returning its public attachment URL. */
export async function POST(request: Request) {
  const auth = await withAnyPermission(["announcements.create"]);
  if (!auth.ok) return auth.response;
  const { user } = auth.ctx;
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
  if (!key.startsWith(toObjectId(user.id).toHexString() + "/")) return NextResponse.json({ error: "Invalid upload owner." }, { status: 403 });
  const storage = getStorageDriver();
  if (!(storage instanceof R2StorageDriver)) return NextResponse.json({ error: "Direct upload is unavailable for this storage driver." }, { status: 409 });
  let inspected;
  try {
    inspected = await storage.inspectUpload(bucket, key);
  } catch {
    return NextResponse.json({ error: "Uploaded file could not be verified. Please retry." }, { status: 400 });
  }
  if (inspected.size !== size || inspected.mime !== mime || sniffMismatch(mime, inspected.prefix)) {
    await storage.delete(bucket, key).catch(() => undefined);
    return NextResponse.json({ error: "Uploaded file did not pass verification." }, { status: 400 });
  }
  return NextResponse.json({ url: storage.publicUrl(bucket, key), fileName: fileName.slice(0, 200) }, { headers: { "Cache-Control": "private, no-store" } });
}
