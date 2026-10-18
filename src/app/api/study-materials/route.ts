import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { studyMaterialCreateSchema, STUDY_MATERIAL_TYPES } from "@/lib/validation";
import { createStudyMaterial, listStudyMaterials } from "@/lib/db/studyMaterials";
import { toStudyMaterialJSON } from "@/lib/db/contracts";
import { parseLimitParam } from "@/lib/utils";
import { guardRate, jsonError, withAnyPermission, withUser } from "@/lib/security/authorize";
import { canUploadStudyMaterials } from "@/lib/permissions";
import type { StudyMaterialType } from "@/lib/mongo/collections";

/**
 * Study materials API.
 *
 * GET  — approved library (any signed-in user); `mine=true` also shows the
 *        caller's own held materials so teachers can see their submissions.
 * POST — teacher/admin upload (permission-gated), moderated before publishing.
 */

export async function POST(request: NextRequest) {
  const db = await getDb();
  await ensureIndexes(db);
  // Only teachers/admins publish study materials (students cannot).
  const auth = await withAnyPermission(["study.upload", "study.manage"]);
  if (!auth.ok) return auth.response;
  const { user } = auth.ctx;
  if (!canUploadStudyMaterials(user.role)) {
    return jsonError(403, "Only teachers can upload study materials");
  }

  const limited = guardRate(request, user.id, "uploads");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const validated = studyMaterialCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const created = await createStudyMaterial(db, user.id, validated.data);
  if (!created.ok) {
    if (created.reason === "bad_key" || created.reason === "bad_url") {
      return jsonError(400, "Invalid file reference");
    }
    return jsonError(400, "Invalid bucket");
  }
  return NextResponse.json(
    { success: true, id: created.materialId.toHexString(), status: created.status },
    { status: 201 }
  );
}

export async function GET(request: NextRequest) {
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;

  const { searchParams } = new URL(request.url);
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);
  const search = searchParams.get("search")?.slice(0, 100) || undefined;
  const subject = searchParams.get("subject")?.slice(0, 100) || undefined;
  const classGrade = searchParams.get("classGrade")?.slice(0, 50) || undefined;
  const materialType = searchParams.get("materialType");
  const tag = searchParams.get("tag")?.slice(0, 30) || undefined;
  const teacher = searchParams.get("teacher")?.slice(0, 100) || undefined;
  const semester = searchParams.get("semester")?.slice(0, 30) || undefined;
  const academicYear = searchParams.get("academicYear")?.slice(0, 20) || undefined;
  const savedOnly = searchParams.get("saved") === "true";
  const mine = searchParams.get("mine") === "true";
  const sort = searchParams.get("sort") === "oldest" ? "oldest" : "newest";
  const featuredOnly = searchParams.get("featured") === "true";
  const cursor = searchParams.get("cursor");
  let before: Date | undefined;
  if (cursor) {
    const p = new Date(cursor);
    if (!isNaN(+p)) before = p;
  }

  const items = await listStudyMaterials(db, {
    search,
    subject,
    classGrade,
    materialType:
      materialType && (STUDY_MATERIAL_TYPES as readonly string[]).includes(materialType)
        ? (materialType as StudyMaterialType)
        : undefined,
    tag,
    teacher,
    semester,
    academicYear,
    savedBy: savedOnly ? user.id : undefined,
    includeOwnPending: mine ? user.id : undefined,
    sort,
    featuredOnly,
    limit,
    before,
  });
  // Stable snake_case contract (download URLs gated server-side).
  const mapped = items.map((m) => toStudyMaterialJSON(m as unknown as Record<string, unknown>));
  return NextResponse.json({
    materials: mapped,
    cursor: mapped.length ? mapped[mapped.length - 1].created_at : null,
    hasMore: mapped.length === limit,
    canUpload: canUploadStudyMaterials(user.role),
  });
}
