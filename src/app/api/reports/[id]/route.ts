import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { reviewReport } from "@/lib/db/reports";
import { createNotification } from "@/lib/db/notifications";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import type { ReportStatus } from "@/lib/mongo/collections";

const reviewSchema = z.object({
  status: z.enum(["reviewing", "resolved", "dismissed"]),
  action: z.enum(["warning", "content_removal", "temp_ban", "perm_ban", "dismiss"]).optional(),
  reason: z.string().max(500).optional(),
  moderatorNotes: z.string().max(2000).optional(),
  durationDays: z.number().int().min(1).max(365).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb();
  await ensureIndexes(db);

  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  if (!["admin", "teacher", "staff"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const validated = reviewSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const result = await reviewReport(db, id, user.id, user.role, {
    status: validated.data.status as Exclude<ReportStatus, "pending">,
    action: validated.data.action,
    reason: validated.data.reason,
    moderatorNotes: validated.data.moderatorNotes,
    durationDays: validated.data.durationDays,
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Notify the reporter about the outcome (best effort).
  if (validated.data.action && validated.data.action !== "dismiss") {
    await createNotification(db, {
      recipientId: result.report.reporterId,
      actorId: user.id,
      type: "moderation_action",
      title: "Report reviewed",
      message: `Your report was ${validated.data.status}`,
      data: { report_id: id },
    });
  }

  return NextResponse.json({ success: true });
}
