import { NextResponse } from "next/server";
import { z } from "zod";
import { col, type UserDoc } from "@/lib/mongo/collections";
import { toObjectId, objectIdSchema } from "@/lib/mongo/ids";
import { logAudit } from "@/lib/security/audit";
import { jsonError, withAnyPermission } from "@/lib/security/authorize";

const gradeSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  classGrade: z.string().trim().max(50).nullable(),
});

/** School administrators only: enrollment grade is trusted access-control data. */
export async function PATCH(request: Request) {
  const auth = await withAnyPermission(["users.manage"]);
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const body = await request.json().catch(() => null);
  const parsed = gradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { userId } = parsed.data;
  if (!objectIdSchema.safeParse(userId).success) return jsonError(400, "Invalid user ID");
  const target = await col<UserDoc>(db, "users").findOne({ _id: toObjectId(userId) } as never);
  if (!target) return jsonError(404, "User not found");
  if (target.role === "super_admin" && user.role !== "super_admin") return jsonError(403, "Forbidden");

  const nextGrade = parsed.data.classGrade?.trim().slice(0, 50) || null;
  await col<UserDoc>(db, "users").updateOne(
    { _id: target._id } as never,
    { $set: { classGrade: nextGrade, updatedAt: new Date() } }
  );
  await logAudit(db, {
    actorId: user.id,
    action: "admin.user.grade.change",
    targetType: "user",
    targetId: userId,
    details: { from: target.classGrade ?? null, to: nextGrade },
  });
  return NextResponse.json({ success: true, classGrade: nextGrade });
}
