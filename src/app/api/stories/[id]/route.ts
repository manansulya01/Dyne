import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { deleteStory, getStory, recordStoryView } from "@/lib/db/stories";
import { toStoryJSON } from "@/lib/db/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { withUser, jsonError, guardRate } from "@/lib/security/authorize";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getDb();
  await ensureIndexes(db);
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Story not found");

  const user = await getSessionUser(db);
  const story = await getStory(db, id);
  if (!story) return jsonError(404, "Story not found");

  const status = String(story.moderationStatus ?? "pending");
  const isOwner = user && String(story.authorId) === user.id;
  const isModerator = user ? hasPermission(user.role as never, "stories.moderate") : false;
  if (status !== "approved" && !isOwner && !isModerator) {
    return jsonError(404, "Story not found");
  }

  let viewCount = Number(story.viewCount ?? 0);
  if (user && status === "approved") {
    const recorded = await recordStoryView(db, id, user.id);
    if (recorded.ok) viewCount = recorded.viewCount;
  }

  return NextResponse.json({
    story: { ...toStoryJSON(story as unknown as Record<string, unknown>), view_count: viewCount },
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;

  const limited = guardRate(request, user.id, "academicWrites");
  if (limited) return limited;

  const result = await deleteStory(db, id, user.id, user.role);
  if (!result.ok) {
    if (result.reason === "not_found") return jsonError(404, "Story not found");
    return jsonError(403, "Forbidden");
  }
  return NextResponse.json({ success: true });
}
