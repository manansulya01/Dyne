import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type AnnouncementDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
} from "@/lib/db/announcements";
import { announcementCreateSchema } from "@/lib/validation";
import { requireSessionUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/permissions";
import { parseLimitParam } from "@/lib/utils";
import { guardRate, jsonError, withAnyPermission, withUser } from "@/lib/security/authorize";
import { logAudit } from "@/lib/security/audit";

/**
 * Announcements API.
 *
 * GET  — visible announcements for the caller's role.
 * POST — teacher/admin create (permission-gated).
 * PATCH — update and/or publish. Publishing fans out notifications exactly once.
 * DELETE — admin only.
 */

const updateSchema = z.object({
  id: objectIdSchema,
  title: z.string().trim().min(3).max(200).optional(),
  body: z.string().trim().min(1).max(10000).optional(),
  category: z.string().trim().max(50).nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  isPinned: z.boolean().optional(),
  linkUrl: z.string().max(2000).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  publish: z.boolean().optional(),
});

const deleteSchema = z.object({ id: objectIdSchema });

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await requireSessionUser(db).catch(() => null);

  const { searchParams } = new URL(request.url);
  const mine = searchParams.get("mine") === "true";
  const items = await listAnnouncements(db, {
    limit: parseLimitParam(searchParams.get("limit"), 20, 50),
    viewerRole: user?.role,
    viewerId: user?.id,
    authoredBy: mine ? user?.id : undefined,
  });
  return NextResponse.json({ announcements: items });
}

export async function POST(request: Request) {
  const auth = await withAnyPermission(["announcements.create"]);
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;

  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const validated = announcementCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;
  const created = await createAnnouncement(db, user.id, {
    title: d.title,
    body: d.body,
    category: d.category ?? null,
    priority: (d as { priority?: "low" | "normal" | "high" | "urgent" }).priority ?? "normal",
    audience: (d.audience as "all" | "students" | "teachers" | "staff" | "selected") ?? "all",
    audienceIds: (d as { audienceIds?: string[] }).audienceIds,
    audienceClassGrade: (d as { audienceClassGrade?: string }).audienceClassGrade ?? null,
    isPinned: d.isPinned,
    linkUrl: (d as { linkUrl?: string }).linkUrl ?? null,
    startsAt: d.startsAt ? new Date(d.startsAt) : null,
    endsAt: d.endsAt ? new Date(d.endsAt) : null,
  });
  if (!created.ok) {
    const message =
      created.reason === "bad_link"
        ? "Invalid link URL"
        : created.reason === "bad_attachment"
          ? "Invalid attachment URL"
          : created.reason === "no_audience"
            ? "Select at least one recipient"
            : "Invalid announcement data";
    return jsonError(400, message);
  }

  // Publish immediately when requested, otherwise it stays a draft.
  const wantsPublish = (body as { publish?: boolean })?.publish === true;
  let notified = 0;
  let published = false;
  if (wantsPublish) {
    const result = await publishAnnouncement(db, created.announcementId, user.id);
    published = result.ok;
    notified = result.notified;
    if (!result.ok && result.reason === "held_for_review") {
      return NextResponse.json(
        {
          announcement: { id: created.announcementId.toHexString() },
          published: false,
          heldForReview: true,
          message: "Announcement held for moderator review.",
        },
        { status: 202 }
      );
    }
    if (!result.ok && result.reason === "rejected") {
      return NextResponse.json(
        {
          announcement: { id: created.announcementId.toHexString() },
          published: false,
          message: "Announcement rejected by moderation.",
        },
        { status: 422 }
      );
    }
  }

  await logAudit(db, {
    actorId: user.id,
    action: "announcement.create",
    targetType: "announcement",
    targetId: created.announcementId.toHexString(),
    details: { published, notified },
  });

  return NextResponse.json(
    {
      announcement: { id: created.announcementId.toHexString() },
      published,
      notified,
    },
    { status: 201 }
  );
}

export async function PATCH(request: Request) {
  const auth = await withAnyPermission(["announcements.manage"]);
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;

  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const validated = updateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;

  const existing = await col<AnnouncementDoc>(db, "announcements").findOne({
    _id: toObjectId(d.id),
  } as never);
  if (!existing) return jsonError(404, "Announcement not found");
  // Author or admin only.
  if (existing.createdBy.toHexString() !== user.id && !isAdminRole(user.role)) {
    return jsonError(403, "Forbidden");
  }

  const updated = await updateAnnouncement(db, d.id, {
    title: d.title,
    body: d.body,
    category: d.category,
    priority: d.priority,
    isPinned: d.isPinned,
    linkUrl: d.linkUrl,
    startsAt: d.startsAt === undefined ? undefined : d.startsAt ? new Date(d.startsAt) : null,
    endsAt: d.endsAt === undefined ? undefined : d.endsAt ? new Date(d.endsAt) : null,
  });
  if (!updated.ok) {
    return jsonError(updated.reason === "bad_link" ? 400 : 404, "Could not update announcement");
  }

  if (d.publish) {
    const result = await publishAnnouncement(db, d.id, user.id);
    await logAudit(db, {
      actorId: user.id,
      action: "announcement.publish",
      targetType: "announcement",
      targetId: d.id,
      details: { notified: result.notified, ok: result.ok, reason: result.reason ?? null },
    });
    if (!result.ok) {
      const status = result.reason === "held_for_review" ? 202 : result.reason === "rejected" ? 422 : 409;
      return NextResponse.json(
        { published: false, reason: result.reason, notified: result.notified },
        { status }
      );
    }
    return NextResponse.json({ published: true, notified: result.notified });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;

  const body = await request.json().catch(() => null);
  const validated = deleteSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: "Announcement ID required" }, { status: 400 });
  }
  // Deletion is admin-only (announcement deletion is an admin capability).
  if (!(user.role === "admin" || user.role === "super_admin")) {
    return jsonError(403, "Forbidden");
  }
  const result = await deleteAnnouncement(db, validated.data.id);
  if (!result.ok) return jsonError(404, "Announcement not found");
  await logAudit(db, {
    actorId: user.id,
    action: "announcement.delete",
    targetType: "announcement",
    targetId: validated.data.id,
  });
  return NextResponse.json({ success: true });
}
