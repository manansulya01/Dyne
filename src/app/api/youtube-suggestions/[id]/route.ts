import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type YouTubeSuggestionDoc } from "@/lib/mongo/collections";
import { withUser } from "@/lib/security/authorize";
import { toObjectId, objectIdSchema } from "@/lib/mongo/ids";
import { logAudit } from "@/lib/security/audit";

const reviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  targetGrades: z.array(z.string().trim().min(1).max(20)).max(20).optional(),
  reason: z.string().trim().max(500).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  if (!["teacher", "admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Only teachers and administrators can review video suggestions." }, { status: 403 });
  }
  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const targetGrades = [...new Set((parsed.data.targetGrades ?? []).map((grade) => grade.trim()).filter(Boolean))];
  if (parsed.data.status === "approved" && targetGrades.length === 0) {
    return NextResponse.json({ error: "Select at least one grade, or use * to approve for the whole school." }, { status: 400 });
  }
  if (targetGrades.some((grade) => grade !== "*" && !/^[A-Za-z0-9][A-Za-z0-9 -]{0,19}$/.test(grade))) {
    return NextResponse.json({ error: "One or more grade values are invalid." }, { status: 400 });
  }
  const reason = parsed.data.reason?.trim().slice(0, 500) || null;
  if (parsed.data.status === "rejected" && !reason) {
    return NextResponse.json({ error: "Add a short reason when rejecting a suggestion." }, { status: 400 });
  }

  await ensureIndexes(db);
  const now = new Date();
  const result = await col<YouTubeSuggestionDoc>(db, "youtubeSuggestions").updateOne(
    { _id: toObjectId(id), status: "pending" } as never,
    { $set: {
      status: parsed.data.status,
      targetGrades: parsed.data.status === "approved" ? targetGrades : [],
      reviewReason: reason,
      reviewedBy: toObjectId(user.id),
      reviewedAt: now,
      updatedAt: now,
    } } as never
  );
  if (!result.matchedCount) return NextResponse.json({ error: "Suggestion not found or already reviewed." }, { status: 404 });
  await logAudit(db, {
    actorId: user.id,
    action: `youtube_suggestion.${parsed.data.status}`,
    targetType: "video",
    targetId: id,
    details: { targetGrades: parsed.data.status === "approved" ? targetGrades : [], reason },
  });
  return NextResponse.json({ success: true, status: parsed.data.status, targetGrades });
}
