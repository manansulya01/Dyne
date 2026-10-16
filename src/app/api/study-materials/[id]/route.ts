import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type StudyMaterialDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { moderateStudyMaterial } from "@/lib/db/studyMaterials";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { logAudit } from "@/lib/security/audit";

interface Params {
  params: Promise<{ id: string }>;
}

const moderateSchema = z.object({
  action: z.enum(["remove", "restore", "feature", "unfeature", "reject", "approve"]),
});

/** Moderation endpoint (staff-only, server-side). Deletion by owner handled via DELETE. */
export async function PATCH(request: Request, { params }: Params) {
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
  const body = await request.json().catch(() => null);
  const validated = moderateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const result = await moderateStudyMaterial(db, id, user.role, validated.data.action);
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await logAudit(db, {
    actorId: user.id,
    action: `study.${validated.data.action}`,
    targetType: "study_material",
    targetId: id,
  });
  return NextResponse.json({ success: true });
}

/** Owner delete (soft-remove) or privileged hard path via PATCH. */
export async function DELETE(_request: Request, { params }: Params) {
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
  if (!row || row.isRemoved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const privileged = ["moderator", "admin", "super_admin", "staff"].includes(user.role);
  if (!row.uploaderId.equals(toObjectId(user.id)) && !privileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await col<StudyMaterialDoc>(db, "studyMaterials").updateOne(
    { _id: row._id } as never,
    { $set: { isRemoved: true, updatedAt: new Date() } }
  );
  await logAudit(db, { actorId: user.id, action: "study.remove", targetType: "study_material", targetId: id });
  return NextResponse.json({ success: true });
}
