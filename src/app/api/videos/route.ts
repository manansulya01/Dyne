import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { createVideo, listVideoCategories, listVideos, getVideo } from "@/lib/db/videos";
import { toVideoJSON } from "@/lib/db/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import { guardRate, withPermission } from "@/lib/security/authorize";

/**
 * Horizontal video collection API.
 *
 * GET  — approved feed; session optional (public shape).
 * POST — teacher/admin upload, gated by `videos.create`, run through the
 *        moderation pipeline before anything is published.
 */

const videoCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(5000).optional(),
  videoUrl: z.string().min(1).max(2000),
  thumbnailUrl: z.string().min(1).max(2000).optional(),
  category: z.string().max(50).optional(),
  duration: z.number().int().nonnegative().max(60 * 60 * 6).optional(),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
});

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  const { searchParams } = new URL(request.url);
  const user = await getSessionUser(db);
  const limit = parseLimitParam(searchParams.get("limit"), 24, 48);
  const category = searchParams.get("category") || undefined;
  const mine = searchParams.get("mine") === "true";
  const popular = searchParams.get("sort") === "popular";
  const search = (searchParams.get("search") || "").trim().slice(0, 100) || undefined;
  const creatorId = searchParams.get("creatorId") || undefined;

  if (mine && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let before: { createdAt: Date; id: string } | null = null;
  let legacyMaxViews: number | null = null;
  const rawBefore = searchParams.get("before");
  const beforeId = searchParams.get("beforeId");
  if (rawBefore && beforeId && /^[0-9a-fA-F]{24}$/.test(beforeId)) {
    const d = new Date(rawBefore);
    if (!isNaN(+d)) before = { createdAt: d, id: beforeId };
  } else {
    // Legacy cursor (createdAt ISO) still accepted for the existing Watch
    // client; ordering stays deterministic via the `_id` tiebreak.
    const rawCursor = searchParams.get("cursor");
    if (rawCursor && !popular) {
      const d = new Date(rawCursor);
      if (!isNaN(+d)) before = { createdAt: d, id: "" };
    } else if (rawCursor && popular) {
      const maxViews = Number(rawCursor);
      if (Number.isFinite(maxViews)) legacyMaxViews = maxViews;
    }
  }

  const videos = await listVideos(db, {
    limit,
    category,
    creatorId: mine ? user?.id : creatorId,
    includeOwnPending: mine ? user?.id : undefined,
    sort: popular ? "popular" : "new",
    before,
    search,
    maxViews: legacyMaxViews,
  });
  const mapped = videos.map((v) => toVideoJSON(v as unknown as Record<string, unknown>));

  const last = mapped[mapped.length - 1];
  return NextResponse.json({
    videos: mapped,
    // Keyset cursor (stable, duplicate-free) …
    cursor: last
      ? { before: String(last.created_at), beforeId: last.id }
      : null,
    // … plus the legacy scalar cursor the existing Watch client reads.
    legacyCursor: last
      ? popular
        ? last.view_count
        : String(last.created_at)
      : null,
    hasMore: mapped.length === limit,
    // Category chips are built from the server's full set, not just the
    // loaded page, so filtering never silently loses options.
    categories: await listVideoCategories(db),
  });
}

export async function POST(request: Request) {
  const auth = await withPermission("videos.create");
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;

  const limited = guardRate(request, user.id, "uploads");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const validated = videoCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;

  const created = await createVideo(db, user.id, {
    title: d.title,
    description: d.description,
    videoUrl: d.videoUrl,
    thumbnailUrl: d.thumbnailUrl,
    category: d.category,
    duration: d.duration,
    width: d.width,
    height: d.height,
  });

  if (!created.ok) {
    if (created.reason === "bad_thumbnail") {
      return NextResponse.json({ error: { thumbnailUrl: ["Invalid thumbnail URL"] } }, { status: 400 });
    }
    if (created.reason === "bad_url") {
      return NextResponse.json({ error: { videoUrl: ["Invalid video URL"] } }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid video data" }, { status: 400 });
  }

  const row = await getVideo(db, created.videoId, user.id);
  return NextResponse.json(
    {
      video: row
        ? toVideoJSON(row as unknown as Record<string, unknown>)
        : { id: created.videoId.toHexString() },
      moderationStatus: created.moderationStatus,
    },
    { status: 201 }
  );
}
