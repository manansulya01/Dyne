import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { createReel, listReelCategories, listReels } from "@/lib/db/reels";
import { toReelJSON } from "@/lib/db/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { withAnyPermission, withPermission } from "@/lib/security/authorize";
import { parseLimitParam } from "@/lib/utils";

/**
 * Reels collection API.
 *
 * GET  — approved feed (public shape, session optional) with stable keyset
 *        pagination. `mine=true` includes the caller's own held reels.
 * POST — teacher/admin upload. Runs the moderation pipeline; nothing is
 *        published until the pipeline approves it.
 */

const reelCreateSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200),
  caption: z.string().trim().max(2000).optional(),
  videoUrl: z.string().min(1).max(2000),
  thumbnailUrl: z.string().min(1).max(2000).optional(),
  category: z.string().trim().max(50).optional(),
  hashtags: z.array(z.string().max(40)).max(20).optional(),
  durationSeconds: z.number().int().min(0).max(90).optional(),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional(),
});

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  const { searchParams } = new URL(request.url);
  const limit = parseLimitParam(searchParams.get("limit"), 8, 12);
  const category = searchParams.get("category") || undefined;
  const mine = searchParams.get("mine") === "true";
  const sort = searchParams.get("sort") === "popular" ? "popular" : "new";
  const beforeCreatedAt = searchParams.get("before");
  const beforeId = searchParams.get("beforeId");

  // Optional session: the public feed works logged out; `mine` needs a user.
  const user = await getSessionUser(db);

  let before: { createdAt: Date; id: string } | null = null;
  if (beforeCreatedAt && beforeId) {
    const d = new Date(beforeCreatedAt);
    if (!isNaN(+d) && /^[0-9a-fA-F]{24}$/.test(beforeId)) {
      before = { createdAt: d, id: beforeId };
    }
  }

  if (mine && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reels = await listReels(db, {
    limit,
    category,
    sort,
    creatorId: searchParams.get("creatorId") || undefined,
    includeOwnPending: mine ? user?.id : undefined,
    before,
  });

  const mapped = reels.map((r) => toReelJSON(r as unknown as Record<string, unknown>));

  return NextResponse.json({
    reels: mapped,
    // Keyset cursor: (createdAt, id). Stable ordering prevents duplicates and
    // gaps even when many reels share a timestamp.
    cursor:
      mapped.length > 0
        ? {
            before: String(mapped[mapped.length - 1].created_at),
            beforeId: mapped[mapped.length - 1].id,
          }
        : null,
    hasMore: mapped.length === limit,
    categories: await listReelCategories(db),
  });
}

export async function POST(request: Request) {
  const auth = await withPermission("reels.create");
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;

  const body = await request.json().catch(() => null);
  const validated = reelCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = validated.data;

  const created = await createReel(db, user.id, {
    title: d.title,
    caption: d.caption ?? null,
    videoUrl: d.videoUrl,
    thumbnailUrl: d.thumbnailUrl ?? null,
    category: d.category ?? null,
    hashtags: d.hashtags ?? [],
    durationSeconds: d.durationSeconds ?? null,
    width: d.width ?? null,
    height: d.height ?? null,
  });

  if (!created.ok) {
    const field =
      created.reason === "bad_url"
        ? "videoUrl"
        : created.reason === "bad_thumbnail"
          ? "thumbnailUrl"
          : created.reason === "bad_hashtags"
            ? "hashtags"
            : "title";
    const message =
      created.reason === "bad_title"
        ? ["Title must be 3-200 characters"]
        : created.reason === "bad_url"
          ? ["Invalid video URL"]
          : created.reason === "bad_thumbnail"
            ? ["Invalid thumbnail URL"]
            : ["Too many hashtags"];
    return NextResponse.json({ error: { [field]: message } }, { status: 400 });
  }

  return NextResponse.json(
    {
      reel: { id: created.reelId.toHexString() },
      moderationStatus: created.moderationStatus,
    },
    { status: 201 }
  );
}

/** Explicit upload permission probe (used by the upload page). */
export async function PUT() {
  const auth = await withAnyPermission(["reels.create"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ canUpload: true });
}
