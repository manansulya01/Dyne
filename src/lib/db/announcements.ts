import { Db, ObjectId } from "mongodb";
import {
  col,
  type AnnouncementDoc,
  type ModerationReviewDoc,
} from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serialize, serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";
import { createNotification } from "./notifications";
import { moderateContent } from "@/lib/moderation";
import { isSafeMediaUrl } from "./videos";
import { logAudit } from "@/lib/security/audit";

/**
 * Campus announcements with audience targeting and one-time notification
 * fan-out. Delivery is idempotent: `notificationKey` + a sparse unique index
 * guarantee a retried publish never spams the same recipient twice.
 */

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  category?: string | null;
  priority?: AnnouncementDoc["priority"];
  audience?: AnnouncementDoc["audience"];
  audienceIds?: string[];
  audienceClassGrade?: string | null;
  audienceCommunityId?: string | null;
  isPinned?: boolean;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  linkUrl?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

/** External links must be http(s); never javascript:/data:. */
export function isSafeLinkUrl(value: unknown, maxLength = 2000): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    /^https?:\/\/.+/i.test(value)
  );
}

export async function createAnnouncement(
  db: Db,
  createdBy: string | ObjectId,
  input: CreateAnnouncementInput
) {
  if (input.attachmentUrl && !isSafeMediaUrl(input.attachmentUrl)) {
    return { ok: false as const, reason: "bad_attachment" as const };
  }
  if (input.linkUrl && !isSafeLinkUrl(input.linkUrl)) {
    return { ok: false as const, reason: "bad_link" as const };
  }
  const audience = input.audience ?? "all";
  let audienceIds: ObjectId[] = [];
  if (audience === "selected") {
    const raw = input.audienceIds ?? [];
    if (raw.length === 0) return { ok: false as const, reason: "no_audience" as const };
    audienceIds = raw.slice(0, 500).map((id) => toObjectId(id));
  }
  if (input.audienceCommunityId && !objectIdLike(input.audienceCommunityId)) {
    return { ok: false as const, reason: "bad_community" as const };
  }

  const now = new Date();
  const res = await col<AnnouncementDoc>(db, "announcements").insertOne({
    title: input.title.trim().slice(0, 200),
    body: input.body.slice(0, 10000),
    category: input.category?.trim().slice(0, 50) || null,
    priority: input.priority ?? "normal",
    audience,
    audienceIds,
    audienceClassGrade: input.audienceClassGrade?.trim().slice(0, 50) || null,
    audienceCommunityId: input.audienceCommunityId ? toObjectId(input.audienceCommunityId) : null,
    isPinned: !!input.isPinned,
    attachmentUrl: input.attachmentUrl ?? null,
    attachmentName: input.attachmentName?.slice(0, 200) ?? null,
    linkUrl: input.linkUrl ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    notificationKey: null,
    createdBy: toObjectId(createdBy),
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, announcementId: res.insertedId };
}

function objectIdLike(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);
}

/**
 * Resolve the real recipient set for an announcement.
 * Only roles that actually exist in Dyne are targeted — nothing is invented.
 */
export async function resolveRecipients(
  db: Db,
  announcement: AnnouncementDoc
): Promise<ObjectId[]> {
  switch (announcement.audience) {
    case "students":
      return (await col(db, "users").find({ role: "student" } as never).project({ _id: 1 }).limit(2000).toArray())
        .map((u) => (u as unknown as { _id: ObjectId })._id);
    case "teachers":
      return (await col(db, "users").find({ role: "teacher" } as never).project({ _id: 1 }).limit(2000).toArray())
        .map((u) => (u as unknown as { _id: ObjectId })._id);
    case "staff":
      return (await col(db, "users").find({ role: { $in: ["staff", "admin", "super_admin"] } } as never).project({ _id: 1 }).limit(2000).toArray())
        .map((u) => (u as unknown as { _id: ObjectId })._id);
    case "selected": {
      if (announcement.audienceIds.length === 0) return [];
      const rows = await col(db, "users")
        .find({ _id: { $in: announcement.audienceIds } } as never)
        .project({ _id: 1 })
        .limit(2000)
        .toArray();
      return rows.map((u) => (u as unknown as { _id: ObjectId })._id);
    }
    case "all":
    default: {
      const rows = await col(db, "users").find({} as never).project({ _id: 1 }).limit(2000).toArray();
      let ids = rows.map((u) => (u as unknown as { _id: ObjectId })._id);
      if (announcement.audienceClassGrade) {
        const filtered = await col(db, "users")
          .find({ _id: { $in: ids }, classGrade: announcement.audienceClassGrade } as never)
          .project({ _id: 1 })
          .limit(2000)
          .toArray();
        ids = filtered.map((u) => (u as unknown as { _id: ObjectId })._id);
      }
      if (announcement.audienceCommunityId) {
        const members = await col(db, "communityMembers")
          .find({ communityId: announcement.audienceCommunityId } as never)
          .project({ userId: 1 })
          .limit(2000)
          .toArray();
        const memberIds = members.map((m) => m.userId);
        ids = ids.filter((id) => memberIds.some((m) => m.equals(id)));
      }
      return ids;
    }
  }
}

/** Fan out notifications exactly once per recipient (idempotent). */
export async function publishAnnouncement(
  db: Db,
  announcementId: string | ObjectId,
  actorId: string | ObjectId
): Promise<{ ok: boolean; notified: number; reason?: string }> {
  const aid = toObjectId(announcementId);
  const announcement = await col<AnnouncementDoc>(db, "announcements").findOne({ _id: aid } as never);
  if (!announcement) return { ok: false, notified: 0, reason: "not_found" };

  const moderation = await moderateContent(db, {
    contentType: "announcement",
    contentId: aid,
    authorId: announcement.createdBy,
    text: `${announcement.title}\n${announcement.body}`,
    mediaUrl: announcement.attachmentUrl,
    mediaProvided: !!announcement.attachmentUrl,
    trustedAuthor: true,
    excerpt: announcement.title,
    // Announcements are authored by teachers/admins; high-confidence rejection
    // still holds, borderline goes to the moderation queue.
  });

  await col<AnnouncementDoc>(db, "announcements").updateOne(
    { _id: aid } as never,
    {
      $set: {
        notificationKey: `announcement:${aid.toHexString()}`,
        updatedAt: new Date(),
      },
    }
  );

  if (moderation.decision === "rejected") {
    await logAudit(db, {
      actorId: String(actorId),
      action: "announcement.publish.rejected",
      targetType: "announcement",
      targetId: aid.toHexString(),
      details: { reason: moderation.reason, score: moderation.score },
    });
    return { ok: false, notified: 0, reason: "rejected" };
  }
  if (moderation.decision === "flagged" || moderation.decision === "pending") {
    // Held for review: no notification fan-out, moderators see it in the queue.
    await logAudit(db, {
      actorId: String(actorId),
      action: "announcement.publish.held",
      targetType: "announcement",
      targetId: aid.toHexString(),
      details: { reason: moderation.reason },
    });
    return { ok: false, notified: 0, reason: "held_for_review" };
  }

  const recipients = await resolveRecipients(db, announcement);
  let notified = 0;
  for (const recipientId of recipients) {
    if (recipientId.equals(toObjectId(actorId))) continue;
    const inserted = await createNotification(db, {
      recipientId,
      actorId,
      type: "announcement",
      title: announcement.title.slice(0, 120),
      message: announcement.body.slice(0, 200),
      data: { announcement_id: aid.toHexString(), priority: announcement.priority },
      dedupeKey: `announcement:${aid.toHexString()}:${recipientId.toHexString()}`,
    });
    if (inserted) notified += 1;
  }

  await logAudit(db, {
    actorId: String(actorId),
    action: "announcement.publish",
    targetType: "announcement",
    targetId: aid.toHexString(),
    details: { audience: announcement.audience, notified },
  });
  return { ok: true, notified };
}

/**
 * Visibility filter for one viewer.
 *
 * Announcement fan-out already respects class/community targeting, so the
 * listing MUST apply the same rules or a targeted announcement leaks to the
 * whole campus. Students never see staff-only announcements, and a targeted
 * announcement is only listed for its real audience.
 */
async function audienceFilterForViewer(
  db: Db,
  opts: { viewerRole?: string; viewerId?: string }
): Promise<Record<string, unknown> | null> {
  if (!opts.viewerRole || !opts.viewerId) {
    // Anonymous viewers only ever see campus-wide announcements.
    return { audience: "all", audienceClassGrade: null, audienceCommunityId: null };
  }
  const viewer = toObjectId(opts.viewerId);
  if (opts.viewerRole === "student") {
    const me = await col(db, "users")
      .findOne({ _id: viewer } as never, { projection: { classGrade: 1 } })
      .catch(() => null);
    const classGrade = (me as unknown as { classGrade?: string | null } | null)?.classGrade ?? null;
    const membership = await col(db, "communityMembers")
      .findOne({ userId: viewer } as never, { projection: { communityId: 1 } })
      .catch(() => null);
    const communityId =
      (membership as unknown as { communityId?: ObjectId } | null)?.communityId ?? null;
    const or: Record<string, unknown>[] = [
      { audience: "all", audienceClassGrade: null, audienceCommunityId: null },
    ];
    if (classGrade) {
      or.push({ audience: { $in: ["all", "students"] }, audienceClassGrade: classGrade });
    }
    if (communityId) {
      or.push({ audience: { $in: ["all", "students"] }, audienceCommunityId: communityId });
    }
    or.push({ audience: "selected", audienceIds: viewer });
    return { $or: or };
  }
  // Staff (teacher/admin/moderator) see campus-wide plus teaching audiences.
  return { audience: { $in: ["all", "students", "teachers", "staff", "selected"] } };
}

export async function listAnnouncements(
  db: Db,
  opts: {
    limit?: number;
    pinnedFirst?: boolean;
    viewerRole?: string;
    viewerId?: string;
    /** Teacher view: every announcement authored by this teacher. */
    authoredBy?: string | ObjectId;
  } = {}
) {
  const now = new Date();
  const filter: Record<string, unknown> = {
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  };
  if (opts.authoredBy) filter.createdBy = toObjectId(opts.authoredBy);
  const audience = await audienceFilterForViewer(db, opts);
  if (audience) filter.$and = [...(filter.$and as unknown[]), audience];

  const rows = await col<AnnouncementDoc>(db, "announcements")
    .find(filter as never)
    .sort(
      opts.pinnedFirst === false
        ? ({ createdAt: -1, _id: -1 } as never)
        : ({ isPinned: -1, createdAt: -1, _id: -1 } as never)
    )
    .limit(safeLimit(opts.limit, 50))
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.createdBy));
  return serializeMany(
    rows.map((r) => ({ ...r, author: authors.get(r.createdBy.toHexString()) ?? null }))
  );
}

export async function getAnnouncement(db: Db, id: string | ObjectId) {
  const row = await col<AnnouncementDoc>(db, "announcements").findOne({ _id: toObjectId(id) } as never);
  if (!row) return null;
  const authors = await resolveAuthors(db, [row.createdBy]);
  return serialize({ ...row, author: authors.get(row.createdBy.toHexString()) ?? null });
}

export async function updateAnnouncement(
  db: Db,
  id: string | ObjectId,
  patch: Partial<CreateAnnouncementInput>
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 200);
  if (patch.body !== undefined) set.body = patch.body.slice(0, 10000);
  if (patch.category !== undefined) set.category = patch.category?.trim().slice(0, 50) || null;
  if (patch.priority !== undefined) set.priority = patch.priority;
  if (patch.isPinned !== undefined) set.isPinned = patch.isPinned;
  if (patch.startsAt !== undefined) set.startsAt = patch.startsAt;
  if (patch.endsAt !== undefined) set.endsAt = patch.endsAt;
  if (patch.linkUrl !== undefined) {
    if (patch.linkUrl && !isSafeLinkUrl(patch.linkUrl)) return { ok: false as const, reason: "bad_link" as const };
    set.linkUrl = patch.linkUrl;
  }
  const res = await col<AnnouncementDoc>(db, "announcements").updateOne(
    { _id: toObjectId(id) } as never,
    { $set: set }
  );
  return res.matchedCount > 0
    ? { ok: true as const }
    : { ok: false as const, reason: "not_found" as const };
}

export async function deleteAnnouncement(db: Db, id: string | ObjectId) {
  const aid = toObjectId(id);
  const res = await col<AnnouncementDoc>(db, "announcements").deleteOne({ _id: aid } as never);
  if (res.deletedCount === 0) return { ok: false as const, reason: "not_found" as const };
  await col(db, "notifications").deleteMany({ "data.announcement_id": aid.toHexString() } as never);
  await col<ModerationReviewDoc>(db, "moderationReviews").deleteMany({
    contentType: "announcement",
    contentId: aid,
  } as never);
  return { ok: true as const };
}
