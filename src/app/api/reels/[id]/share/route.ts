import { NextResponse } from "next/server";
import { objectIdSchema } from "@/lib/mongo/ids";
import { recordReelShare } from "@/lib/db/reels";
import { withUser, jsonError, guardRate } from "@/lib/security/authorize";
interface Params {
  params: Promise<{ id: string }>;
}
/**
 * Reel share counter.
 *
 * Separate from GET so sharing can never inflate view counts, and rate limited
 * so a single user cannot spam the counter.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Reel not found");
  const limited = guardRate(request, user.id, "reactions");
  if (limited) return limited;
  const shareCount = await recordReelShare(db, id);
  if (shareCount === null) return jsonError(404, "Reel not found");
  return NextResponse.json({ share_count: shareCount });
}