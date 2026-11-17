import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAnyPermission, guardRate } from "@/lib/security/authorize";
import { buildKey, validateUpload } from "@/lib/storage/types";
import { getStorageDriver } from "@/lib/storage";
import { R2StorageDriver } from "@/lib/storage/r2";
import { toObjectId } from "@/lib/mongo/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mime: z.string().min(1).max(120),
  size: z.number().int().positive().max(50 * 1024 * 1024),
});

/** Announcement attachment bytes go directly from browser to R2. */
export async function POST(request: Request) {
  const auth = await withAnyPermission(["announcements.create"]);
  if (!auth.ok) return auth.response;
  const { user } = auth.ctx;
  const limited = guardRate(request, user.id, "uploads");
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  let checked;
  try {
    checked = validateUpload("announcement-attachments", parsed.data.mime, parsed.data.size, parsed.data.fileName);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid file" }, { status: 400 });
  }
  const storage = getStorageDriver();
  if (!(storage instanceof R2StorageDriver)) return NextResponse.json({ direct: false }, { status: 200 });
  const key = buildKey(toObjectId(user.id).toHexString(), randomUUID().replace(/-/g, ""), checked.extension);
  const uploadUrl = await storage.createUploadUrl("announcement-attachments", key, checked.mime, checked.size, 300);
  return NextResponse.json({ direct: true, uploadUrl, bucket: "announcement-attachments", key, mime: checked.mime, size: checked.size, fileName: parsed.data.fileName, expiresIn: 300 }, { headers: { "Cache-Control": "private, no-store" } });
}
