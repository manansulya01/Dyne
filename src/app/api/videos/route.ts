import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { createVideo, listVideos, getVideo } from "@/lib/db/videos";
import { toVideoJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";

const videoCreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  videoUrl: z.string().max(2000),
  thumbnailUrl: z.string().max(2000).optional(),
  category: z.string().max(50).optional(),
  duration: z.number().int().nonnegative().optional(),
});

async function authed() {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    return { db, user };
  } catch (err) {
    const { status, message } = toHttpError(err);
    return { db, error: NextResponse.json({ error: message }, { status }) };
  }
}

export async function GET(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);
  const category = searchParams.get("category") || undefined;
  const mine = searchParams.get("mine") === "true";
  const popular = searchParams.get("sort") === "popular";

  const videos = await listVideos(db, {
    limit,
    category,
    mine: mine ? user.id : undefined,
    sort: popular ? "popular" : "new",
    cursor,
  });
  const mapped = videos.map((v) => toVideoJSON(v as unknown as Record<string, unknown>));

  return NextResponse.json({
    videos: mapped,
    cursor: mapped.length
      ? popular
        ? mapped[mapped.length - 1].view_count
        : mapped[mapped.length - 1].created_at
      : null,
    hasMore: mapped.length === limit,
  });
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const validated = videoCreateSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const created = await createVideo(db, user.id, {
    title: validated.data.title,
    description: validated.data.description,
    videoUrl: validated.data.videoUrl,
    thumbnailUrl: validated.data.thumbnailUrl,
    category: validated.data.category,
    duration: validated.data.duration,
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

  const row = await getVideo(db, created.videoId);
  return NextResponse.json({
    video: row ? toVideoJSON(row as unknown as Record<string, unknown>) : { id: created.videoId.toHexString() },
  });
}
