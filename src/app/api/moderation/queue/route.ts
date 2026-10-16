import { NextResponse } from "next/server";
import { z } from "zod";
import { col, type ModerationReviewDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { applyModerationOverride, moderationCounts } from "@/lib/moderation";
import { resolveAuthors } from "@/lib/db/authors";
import { providerStatusSummary } from "@/lib/moderation/provider";
import { logAudit } from "@/lib/security/audit";
import { jsonError, withPermission } from "@/lib/security/authorize";
import { parseLimitParam } from "@/lib/utils";
const CONTENT_TYPES = ["blog", "post", "message", "video", "reel", "story", "announcement"] as const;
const STATUSES = ["pending", "flagged", "approved", "rejected"] as const;
/**
 * Unified moderation centre queue.
 *
 * Requires `moderation.queue`. Group-message rows expose only a short excerpt
 * and verdict metadata — never full private chat content — and only to roles
 * that hold `chat.moderate`.
 */
export async function GET(request: Request) {
  const auth = await withPermission("moderation.queue");
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const status =
    statusParam && (STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as (typeof STATUSES)[number])
      : undefined;
  const typeParam = searchParams.get("contentType");
  const contentType =
    typeParam && (CONTENT_TYPES as readonly string[]).includes(typeParam)
      ? (typeParam as (typeof CONTENT_TYPES)[number])
      : undefined;
  const limit = parseLimitParam(searchParams.get("limit"), 30, 100);
  const cursor = searchParams.get("cursor");
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (contentType) filter.contentType = contentType;
  // Students can never read the moderation internals; this route already
  // requires moderation.queue, but group messages get an extra gate.
  const canSeeMessages = user.role !== "student";
  if (!canSeeMessages) filter.contentType = { $ne: "message" };
  if (cursor) {
    const d = new Date(cursor);
    if (!isNaN(+d)) filter.createdAt = { $lt: d };
  }
  const rows = await col<ModerationReviewDoc>(db, "moderationReviews")
    .find(filter as never)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
  const authors = await resolveAuthors(
    db,
    rows.map((r) => r.authorId).filter((v): v is NonNullable<typeof v> => !!v)
  );
  const items = rows.map((r) => ({
    id: r._id.toHexString(),
    content_type: r.contentType,
    content_id: r.contentId.toHexString(),
    status: r.status,
    reason: r.reason,
    score: r.score,
    source: r.source,
    provider: r.provider,
    categories: r.categories,
    categories_checked: r.categoriesChecked,
    media_analyzed: r.mediaAnalyzed,
    needs_manual_review: r.needsManualReview,
    excerpt: r.excerpt,
    author: r.authorId ? (authors.get(r.authorId.toHexString()) ?? null) : null,
    conversation_id: r.conversationId ? r.conversationId.toHexString() : null,
    reviewed_by: r.reviewedBy ? r.reviewedBy.toHexString() : null,
    reviewed_at: r.reviewedAt,
    override_reason: r.overrideReason,
    created_at: r.createdAt,
  }));
  return NextResponse.json({
    items,
    counts: await moderationCounts(db),
    contentTypes: CONTENT_TYPES,
    statuses: STATUSES,
    cursor: items.length > 0 ? String(items[items.length - 1].created_at) : null,
    hasMore: rows.length === limit,
    // Non-sensitive provider status (no keys, no prompts, no URLs).
    provider: providerStatusSummary(),
  });
}
const decisionSchema = z.object({
  action: z.enum(["approve", "reject", "dismiss"]),
  reason: z.string().max(500).optional(),
});
/** Apply a human decision to one queued item. Overrides are audited. */
export async function POST(request: Request) {
  const auth = await withPermission("moderation.decide");
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const body = await request.json().catch(() => null);
  const validated = decisionSchema.safeParse(body);
  if (!validated.success) return jsonError(400, "Invalid moderation action");
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id || !objectIdSchema.safeParse(id).success) return jsonError(404, "Review not found");
  const result = await applyModerationOverride(db, toObjectId(id), {
    action: validated.data.action,
    actorId: user.id,
    reason: validated.data.reason ?? null,
  });
  if (!result.ok) {
    if (result.reason === "already_decided") return jsonError(409, "This item was already reviewed");
    return jsonError(404, "Review not found");
  }
  await logAudit(db, {
    actorId: user.id,
    action: `moderation.${validated.data.action}`,
    targetType: "moderation_review",
    targetId: id,
    details: { reason: validated.data.reason ?? null },
  });
  return NextResponse.json({ success: true });
}