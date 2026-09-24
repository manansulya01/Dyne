import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type VideoDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { deleteVideo, getVideo, isSafeMediaUrl, recordVideoView } from "@/lib/db/videos";
import { toVideoJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

interface Params {
  params: Promise<{ id: string }>;
}

async function authed(rawId: string) {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    if (!objectIdSchema.safeParse(rawId).success) {
      return { db, error: NextResponse.json({ error: "Video not found" }, { status: 404 }) };
    }
    return { db, user };
  } catch (err) {
    const { status, message } = toHttpError(err);
    return { db, error: NextResponse.json({ error: message }, { status }) };
  }
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const video = await getVideo(db, id);
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const viewed = await recordVideoView(db, id, user.id);
  const viewCount =
    viewed.ok && "viewCount" in viewed
      ? viewed.viewCount
      : (video as unknown as Record<string, unknown>).viewCount ??
        (video as unknown as Record<string, unknown>).view_count ??
        0;

  return NextResponse.json({
    video: {
      ...toVideoJSON(video as unknown as Record<string, unknown>),
      view_count: viewCount,
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const video = await col<VideoDoc>(db, "videos").findOne({ _id: toObjectId(id) } as never);
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
  if (!video.creatorId.equals(toObjectId(user.id)) && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  const input = (body ?? {}) as Record<string, unknown>;
  if (input.title !== undefined) {
    if (typeof input.title !== "string" || input.title.trim().length < 3 || input.title.length > 200) {
      return NextResponse.json({ error: { title: ["Title must be 3-200 characters"] } }, { status: 400 });
    }
    patch.title = input.title.trim();
  }
  if (input.description !== undefined) {
    if (input.description !== null && (typeof input.description !== "string" || input.description.length > 5000)) {
      return NextResponse.json({ error: { description: ["Description too long"] } }, { status: 400 });
    }
    patch.description = typeof input.description === "string" ? input.description : null;
  }
  if (input.category !== undefined) {
    if (input.category !== null && (typeof input.category !== "string" || input.category.length > 50)) {
      return NextResponse.json({ error: { category: ["Invalid category"] } }, { status: 400 });
    }
    patch.category = typeof input.category === "string" ? input.category.trim() || null : null;
  }
  if (input.thumbnail_url !== undefined) {
    if (input.thumbnail_url !== null && !isSafeMediaUrl(input.thumbnail_url)) {
      return NextResponse.json({ error: { thumbnail_url: ["Invalid thumbnail URL"] } }, { status: 400 });
    }
    patch.thumbnailUrl = input.thumbnail_url;
  }

  await col<VideoDoc>(db, "videos").updateOne({ _id: video._id } as never, { $set: patch });
  const updated = await getVideo(db, id);
  return NextResponse.json({
    video: updated ? toVideoJSON(updated as unknown as Record<string, unknown>) : null,
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const result = await deleteVideo(db, id, user.id, user.role);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
