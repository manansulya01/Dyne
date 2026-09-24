import { Db, ObjectId } from "mongodb";
import {
  col,
  type ReportDoc,
  type ReportTargetType,
  type ReportStatus,
  type ModerationActionDoc,
} from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";

export async function createReport(
  db: Db,
  reporterId: string | ObjectId,
  input: { targetType: ReportTargetType; targetId: string | ObjectId; reason: string; description?: string | null }
) {
  if (!input.reason.trim()) return { ok: false as const, reason: "empty_reason" as const };
  // Reports must reference a real target (no ghost queue entries).
  const targetFilter = { _id: toObjectId(input.targetId) } as never;
  const targetCollection =
    input.targetType === "post"
      ? "posts"
      : input.targetType === "comment"
        ? "comments"
        : input.targetType === "video"
          ? "videos"
          : input.targetType === "community"
            ? "communities"
            : "users";
  const target = await col(db, targetCollection).findOne(targetFilter);
  if (!target) return { ok: false as const, reason: "not_found" as const };
  const now = new Date();
  const res = await col<ReportDoc>(db, "reports").insertOne({
    reporterId: toObjectId(reporterId),
    targetType: input.targetType,
    targetId: toObjectId(input.targetId),
    reason: input.reason.trim().slice(0, 100),
    description: input.description?.trim().slice(0, 2000) || null,
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
  } as never);
  return { ok: true as const, reportId: res.insertedId };
}

export async function listReports(
  db: Db,
  viewerId: string | ObjectId,
  viewerRole: string,
  opts: { status?: ReportStatus; limit?: number; before?: Date } = {}
) {
  const isMod = ["admin", "teacher", "staff"].includes(viewerRole);
  const filter: Record<string, unknown> = {};
  if (!isMod) filter.reporterId = toObjectId(viewerId);
  if (opts.status) filter.status = opts.status;
  if (opts.before) filter.createdAt = { $lt: opts.before };
  const rows = await col<ReportDoc>(db, "reports")
    .find(filter as never)
    .sort({ createdAt: -1 })
    .limit(safeLimit(opts.limit, 50))
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.reporterId));
  return {
    reports: serializeMany(
      rows.map((r) => ({ ...r, reporter: authors.get(r.reporterId.toHexString()) ?? null }))
    ),
    isModerator: isMod,
  };
}

export async function reviewReport(
  db: Db,
  reportId: string | ObjectId,
  moderatorId: string | ObjectId,
  moderatorRole: string,
  input: {
    status: Exclude<ReportStatus, "pending">;
    action?: ModerationActionDoc["action"];
    reason?: string | null;
    moderatorNotes?: string | null;
    /** Suspension length for temp_ban (days, 1-365, default 7). */
    durationDays?: number;
  }
) {
  if (!["admin", "teacher", "staff"].includes(moderatorRole)) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  const rid = toObjectId(reportId);
  const report = await col<ReportDoc>(db, "reports").findOne({ _id: rid } as never);
  if (!report) return { ok: false as const, reason: "not_found" as const };

  await col<ReportDoc>(db, "reports").updateOne(
    { _id: rid } as never,
    {
      $set: {
        status: input.status,
        reviewedBy: toObjectId(moderatorId),
        reviewedAt: new Date(),
        moderatorNotes: input.moderatorNotes ?? null,
      },
    }
  );

  if (input.action && input.action !== "dismiss") {
    await col<ModerationActionDoc>(db, "moderationActions").insertOne({
      moderatorId: toObjectId(moderatorId),
      targetType: report.targetType,
      targetId: report.targetId,
      action: input.action,
      reason: input.reason ?? null,
      moderatorNotes: input.moderatorNotes ?? null,
      createdAt: new Date(),
    } as never);

    // Content removal executes against the target collection.
    if (input.action === "content_removal") {
      const stamp = { $set: { deletedAt: new Date(), updatedAt: new Date() } };
      if (report.targetType === "post") {
        await col(db, "posts").updateOne({ _id: report.targetId } as never, stamp);
      } else if (report.targetType === "comment") {
        await col(db, "comments").updateOne({ _id: report.targetId } as never, stamp);
      } else if (report.targetType === "video") {
        await col(db, "videos").deleteOne({ _id: report.targetId } as never);
      }
    }

    // Bans suspend the reported user (when the target is a user) and revoke
    // their sessions so the ban takes effect immediately. Warnings are
    // log-only by design: a warning notifies without restricting access.
    if (input.action === "temp_ban" || input.action === "perm_ban") {
      if (report.targetType === "user") {
        const days =
          input.action === "perm_ban"
            ? 36500
            : Math.min(Math.max(Math.floor(input.durationDays ?? 7), 1), 365);
        await col(db, "users").updateOne(
          { _id: report.targetId } as never,
          { $set: { suspendedUntil: new Date(Date.now() + days * 24 * 3600 * 1000), updatedAt: new Date() } }
        );
        await col(db, "sessions").deleteMany({ userId: report.targetId } as never);
      }
    }
  }

  return { ok: true as const, report };
}
