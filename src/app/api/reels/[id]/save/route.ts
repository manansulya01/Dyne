import { NextResponse } from "next/server";
import { col } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { setReelSave } from "@/lib/db/reels";
import { jsonError, withUser } from "@/lib/security/authorize";
interface Params {
  params: Promise<{ id: string }>;
}
/**
 * Save / unsave a reel for the current user.
 * Idempotent, and always scoped to the session user (never a body-supplied id).
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Reel not found");
  const saved = await col(db, "savedReels").findOne({
    userId: toObjectId(user.id),
    reelId: toObjectId(id),
  } as never);
  return NextResponse.json({ saved: !!saved });
}
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Reel not found");
  // Target-state save, so a retried request is a no-op rather than a second row.
  const result = await setReelSave(db, id, user.id, true);
  if (!result.ok) return jsonError(404, "Reel not found");
  return NextResponse.json({ saved: true, save_count: result.saveCount });
}
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Reel not found");
  const result = await setReelSave(db, id, user.id, false);
  if (!result.ok) return jsonError(404, "Reel not found");
  return NextResponse.json({ saved: false, save_count: result.saveCount });
}