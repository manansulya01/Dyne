import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type FeedbackDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { feedbackAdminUpdateSchema } from "@/lib/validation";
import { updateFeedbackAdmin } from "@/lib/db/feedback";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { logAudit } from "@/lib/security/audit";

interface Params {
  params: Promise<{ id: string }>;
}

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
  const validated = feedbackAdminUpdateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  // Ordinary users cannot modify feedback (even their own) via this endpoint;
  // status/priority/response/notes are staff-only. Ownership is enforced by
  // list filtering (users only see their own).
  const result = await updateFeedbackAdmin(db, id, user.role, {
    status: validated.data.status,
    priority: validated.data.priority,
    adminResponse: validated.data.adminResponse ?? undefined,
    internalNotes: validated.data.internalNotes ?? undefined,
  });
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await logAudit(db, {
    actorId: user.id,
    action: "feedback.update",
    targetType: "feedback",
    targetId: id,
    details: validated.data as unknown as Record<string, unknown>,
  });
  const row = await col<FeedbackDoc>(db, "feedback").findOne({ _id: toObjectId(id) } as never);
  const isStaff = ["moderator", "admin", "super_admin", "staff", "teacher"].includes(user.role);
  if (row && !isStaff) {
    const { internalNotes: _omit, ...rest } = row as Record<string, unknown>;
    void _omit;
    return NextResponse.json({ success: true, feedback: rest });
  }
  return NextResponse.json({ success: true, feedback: row });
}
