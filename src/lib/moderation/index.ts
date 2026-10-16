import type { Db, ObjectId } from "mongodb";
import { col, type ModerationReviewDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { logAudit } from "@/lib/security/audit";
import {
  getModerationProvider,
  runModerationPipeline,
  type ModerationDecision,
  type ModerationTargetType,
  type PipelineResult,
} from "./provider";

/**
 * Shared moderation record + decision store.
 *
 * One `moderationReviews` collection holds the AI/rule verdict for every
 * moderated content type, so the moderation centre can show a single queue
 * with content-type filters. Overrides are auditable and never rewrite the
 * original AI result.
 */

export interface ModerationMetadata {
  moderationStatus: ModerationDecision;
  moderationReason: string | null;
  moderationScore: number | null;
  moderationSource: PipelineResult["source"] | "manual";
  moderationProvider: string | null;
  moderationCategories: string[];
  moderationMediaAnalyzed: boolean;
  moderatedAt: Date;
  moderatedBy: ObjectId | null;
}

export async function recordModerationReview(
  db: Db,
  input: {
    contentType: ModerationTargetType;
    contentId: ObjectId;
    authorId: ObjectId | null;
    conversationId?: ObjectId | null;
    result: PipelineResult;
    /** Short, non-sensitive content excerpt for the moderation queue. */
    excerpt?: string | null;
  }
) {
  const now = new Date();
  await col<ModerationReviewDoc>(db, "moderationReviews").insertOne({
    contentType: input.contentType,
    contentId: input.contentId,
    authorId: input.authorId,
    conversationId: input.conversationId ?? null,
    status: input.result.decision,
    reason: input.result.reason,
    score: input.result.score,
    source: input.result.source,
    provider: input.result.provider,
    categories: input.result.categories,
    categoriesChecked: input.result.categoriesChecked,
    mediaAnalyzed: input.result.mediaAnalyzed,
    needsManualReview: input.result.needsManualReview,
    excerpt: (input.excerpt ?? "").slice(0, 240) || null,
    reviewedBy: null,
    reviewedAt: null,
    overrideReason: null,
    createdAt: now,
  } as never);
}

/**
 * Run the pipeline and persist the review record in one call.
 * Returns the pipeline result so callers can decide publish vs. hold.
 */
export async function moderateContent(
  db: Db,
  input: {
    contentType: ModerationTargetType;
    contentId: ObjectId;
    authorId: ObjectId | null;
    text: string;
    mediaUrl?: string | null;
    mime?: string | null;
    mediaProvided?: boolean;
    conversationId?: ObjectId | null;
    excerpt?: string | null;
    approveThreshold?: number;
    rejectThreshold?: number;
    /** Author is trusted campus staff on a permission-gated authoring route. */
    trustedAuthor?: boolean;
  }
): Promise<PipelineResult> {
  const result = await runModerationPipeline(
    {
      targetType: input.contentType,
      text: input.text,
      mediaUrl: input.mediaUrl ?? null,
      mime: input.mime ?? null,
      mediaProvided: input.mediaProvided ?? false,
      approveThreshold: input.approveThreshold,
      rejectThreshold: input.rejectThreshold,
      trustedAuthor: input.trustedAuthor,
    },
    getModerationProvider()
  );
  await recordModerationReview(db, {
    contentType: input.contentType,
    contentId: input.contentId,
    authorId: input.authorId,
    conversationId: input.conversationId,
    result,
    excerpt: input.excerpt,
  });
  return result;
}

export interface ModerationOverrideAction {
  action: "approve" | "reject" | "dismiss";
  /** Only admins may override an AI/rule verdict (permission-gated upstream). */
  actorId: string | ObjectId;
  reason?: string | null;
}

/**
 * Apply a human decision. The original AI verdict is preserved in the review
 * record (only the status/override fields change), and the action is audited.
 */
export async function applyModerationOverride(
  db: Db,
  reviewId: string | ObjectId,
  input: ModerationOverrideAction
): Promise<{ ok: boolean; reason?: "not_found" | "already_decided" }> {
  const nextStatus: ModerationDecision =
    input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "pending";

  const res = await col<ModerationReviewDoc>(db, "moderationReviews").findOneAndUpdate(
    { _id: toObjectId(reviewId), reviewedAt: null } as never,
    {
      $set: {
        status: nextStatus,
        reviewedBy: toObjectId(input.actorId),
        reviewedAt: new Date(),
        overrideReason: input.reason?.slice(0, 500) ?? null,
      },
    },
    { returnDocument: "after" }
  );
  if (!res) {
    const exists = await col<ModerationReviewDoc>(db, "moderationReviews").findOne({
      _id: toObjectId(reviewId),
    } as never);
    return exists ? { ok: false, reason: "already_decided" } : { ok: false, reason: "not_found" };
  }

  await logAudit(db, {
    actorId: String(input.actorId),
    action: `moderation.override.${input.action}`,
    targetType: res.contentType,
    targetId: res.contentId.toHexString(),
    details: { reviewId: toObjectId(reviewId).toHexString(), reason: input.reason ?? null },
  });
  return { ok: true };
}

/** Queue summary counts for the moderation centre (real counts only). */
export async function moderationCounts(db: Db) {
  const [pending, flagged, approved, rejected, total] = await Promise.all([
    col<ModerationReviewDoc>(db, "moderationReviews").countDocuments({ status: "pending" } as never),
    col<ModerationReviewDoc>(db, "moderationReviews").countDocuments({ status: "flagged" } as never),
    col<ModerationReviewDoc>(db, "moderationReviews").countDocuments({ status: "approved" } as never),
    col<ModerationReviewDoc>(db, "moderationReviews").countDocuments({ status: "rejected" } as never),
    col<ModerationReviewDoc>(db, "moderationReviews").countDocuments({} as never),
  ]);
  return { pending, flagged, approved, rejected, total };
}
