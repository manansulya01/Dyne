import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type StudyMaterialDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { getStorageDriver } from "@/lib/storage";
import { R2StorageDriver } from "@/lib/storage/r2";
import { mimeForKey } from "@/lib/storage/types";
import { canAccessGradeResource } from "@/lib/auth/enrollment";

/**
 * Gated download: authenticated users only; pending, rejected, and removed materials
 * are hidden (404, no existence oracle). Raw storage paths are never exposed —
 * R2 downloads redirect to short-lived signed URLs so file bytes bypass the app server.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = await col<StudyMaterialDoc>(db, "studyMaterials").findOne({ _id: toObjectId(id) } as never);
  if (!row || row.isRemoved || row.status !== "approved") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Students can only retrieve materials for their own enrolled grade. Staff
  // roles retain cross-grade access for teaching and moderation.
  if (!["teacher", "staff", "moderator", "admin", "super_admin"].includes(user.role)) {
    if (!canAccessGradeResource(user.classGrade, row.classGrade)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
  // Demo PDFs are public, read-only fixtures. Only the exact trusted host is allowed;
  // ordinary materials always use the configured private object-storage driver.
  const demoRecord = row as StudyMaterialDoc & { demoBatchId?: string; demoDownloadUrl?: string };
  const demoUrl = demoRecord.demoDownloadUrl;
  if (demoRecord.demoBatchId && typeof demoUrl === "string") {
    try {
      const parsed = new URL(demoUrl);
      if (parsed.protocol === "https:" && parsed.hostname === "www.w3.org" && parsed.pathname === "/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf") {
        return NextResponse.redirect(parsed, { status: 302, headers: { "Cache-Control": "private, no-store" } });
      }
    } catch {
      // Fail closed and continue to normal storage lookup.
    }
  }
  const storage = getStorageDriver();
  if (storage instanceof R2StorageDriver) {
    // Redirect to a short-lived R2 URL: large PDFs and videos bypass the
    // serverless function entirely, support HTTP Range, and do not consume
    // function memory or Mongo connections while bytes are transferred.
    const safeName = row.fileName.replace(/["\r\n]/g, "_");
    const signedUrl = await storage.signedUrl(
      row.bucket as never,
      row.key,
      300,
      `attachment; filename="${safeName}"`
    );
    return new NextResponse(null, {
      status: 302,
      headers: { Location: signedUrl, "Cache-Control": "private, no-store" },
    });
  }
  let file;
  try {
    file = await storage.get(row.bucket as never, row.key);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const safeName = row.fileName.replace(/["\r\n]/g, "_");
  return new NextResponse(file.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": mimeForKey(row.key),
      "Content-Length": String(file.bytes.length),
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
