import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import {
  deleteReel,
  getReel,
  recordReelView,
  toggleReelLike,
} from "@/lib/db/reels";
import { toReelJSON } from "@/lib/db/contracts";
import { isSafeMediaUrl } from "@/lib/db/videos";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { withUser, jsonError } from "@/lib/security/authorize";

interface Params {
  params: Promise<{ id: string }>;
}

/** A reel is readable when approved, or by its owner, or by a moderation role. */
function canViewReel(
  moderationStatus: string,
  creatorId: string,
  viewer: { id: string; role: string } | null
): boolean {
  if (moderationStatus === "approved") return true;
  if (!viewer) return false;
  if (viewer.id === creatorId) return true;
  return hasPermission(viewer.role as never, "reels.moderate");
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getDb();
  await ensureIndexes(db);

  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Reel not found");
  const user = await getSessionUser(db);

  const reel = await getReel(db, id, user?.id);
  if (!reel) return jsonError(404, "Reel not found");

  const status = String(reel.moderationStatus ?? "pending");
  if (!canViewReel(status, String(reel.creatorId), user)) {
    return jsonError(404, "Reel not found");
  }

  // A view is only counted for approved reels the viewer may actually watch.
  let viewCount = Number(reel.viewCount ?? 0);
  if (user && status === "approved") {
    const recorded = await recordReelView(db, id, user.id);
    if (recorded.ok) viewCount = recorded.viewCount;
  }

  return NextResponse.json({
    reel: { ...toReelJSON(reel), view_count: viewCount },
  });
}

const likeSchema = z.object({ action: z.enum(["like", "unlike"]) });

/**
 * Idempotent like target-state.
 *
 * Rapid taps cannot desynchronise the counter: the request states the desired
 * state and the handler reconciles, so a double-click never double-counts.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;

  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Reel not found");

  const body = await request.json().catch(() => ({}));
  const validated = likeSchema.safeParse(body);
  if (!validated.success) return jsonError(400, "Invalid request");
  const wantsLiked = validated.data.action === "like";

  // Toggle once, then a second only if we landed on the wrong state.
  let result = await toggleReelLike(db, id, user.id);
  if (!result.ok) return jsonError(404, "Reel not found");
  if (result.liked !== wantsLiked) {
    result = await toggleReelLike(db, id, user.id);
  }
  return NextResponse.json({ liked: result.liked, like_count: result.likeCount });
}

/** Simple toggle (no target state) for clients that manage their own state. */
export async function PUT(_request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;

  const result = await toggleReelLike(db, id, user.id);
  if (!result.ok) return jsonError(404, "Reel not found");
  return NextResponse.json({ liked: result.liked, like_count: result.likeCount });
}

const patchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  caption: z.string().trim().max(2000).nullable().optional(),
  thumbnailUrl: z.string().max(2000).nullable().optional(),
  category: z.string().trim().max(50).nullable().optional(),
  hashtags: z.array(z.string().max(40)).max(20).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Reel not found");

  const existing = await getReel(db, id);
  if (!existing) return jsonError(404, "Reel not found");
  const isOwner = String(existing.creatorId) === user.id;
  if (!isOwner && !hasPermission(user.role, "reels.edit")) {
    return jsonError(403, "Forbidden");
  }

  const body = await request.json().catch(() => null);
  const validated = patchSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  if (validated.data.thumbnailUrl != null && !isSafeMediaUrl(validated.data.thumbnailUrl)) {
    return jsonError(400, "Invalid thumbnail URL");
  }

  const d = validated.data;
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (d.title !== undefined) set.title = d.title;
  if (d.caption !== undefined) set.caption = d.caption;
  if (d.thumbnailUrl !== undefined) set.thumbnailUrl = d.thumbnailUrl;
  if (d.category !== undefined) set.category = d.category;
  if (d.hashtags !== undefined) {
    set.hashtags = d.hashtags
      .map((h) => h.trim().replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 30))
      .filter(Boolean)
      .slice(0, 10);
  }

  await col(db, "reels").updateOne({ _id: toObjectId(id) } as never, { $set: set });
  const updated = await getReel(db, id, user.id);
  return NextResponse.json({ reel: updated ? toReelJSON(updated) : null });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;

  const result = await deleteReel(db, id, user.id, user.role);
  if (!result.ok) {
    if (result.reason === "not_found") return jsonError(404, "Reel not found");
    return jsonError(403, "Forbidden");
  }
  return NextResponse.json({ success: true });
}
