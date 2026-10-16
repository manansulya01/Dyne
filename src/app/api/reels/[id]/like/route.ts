import { NextResponse } from "next/server";
import { z } from "zod";
import { objectIdSchema } from "@/lib/mongo/ids";
import { toggleReelLike } from "@/lib/db/reels";
import { jsonError, withUser } from "@/lib/security/authorize";
interface Params {
  params: Promise<{ id: string }>;
}
const likeSchema = z.object({ action: z.enum(["like", "unlike"]) });
/**
 * Reel like target-state. Split from the reel resource so the feed can call it
 * without touching the view counter.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Reel not found");
  const body = await request.json().catch(() => ({}));
  const validated = likeSchema.safeParse(body);
  if (!validated.success) return jsonError(400, "Invalid request");
  const wantsLiked = validated.data.action === "like";
  let result = await toggleReelLike(db, id, user.id);
  if (!result.ok) return jsonError(404, "Reel not found");
  if (result.liked !== wantsLiked) {
    result = await toggleReelLike(db, id, user.id);
  }
  return NextResponse.json({ liked: result.liked, like_count: result.likeCount });
}