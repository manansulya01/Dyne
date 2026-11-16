import { NextResponse } from "next/server";
import { z } from "zod";
import { col, type YouTubeSuggestionDoc } from "@/lib/mongo/collections";
import { withUser, guardRate } from "@/lib/security/authorize";
import { toObjectId } from "@/lib/mongo/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const youtubeIdFromUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
      return match?.[1] ?? null;
    }
  } catch { return null; }
  return null;
};

const createSchema = z.object({
  url: z.string().url().max(2048),
  note: z.string().trim().max(500).optional(),
});

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3/videos";

async function getYouTubeMetadata(videoId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_NOT_CONFIGURED");
  const url = new URL(YOUTUBE_API);
  url.searchParams.set("part", "snippet,status,contentDetails");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);
  const response = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("YOUTUBE_LOOKUP_FAILED");
  const data = await response.json() as {
    items?: Array<{
      snippet?: { title?: string; description?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } };
      status?: { privacyStatus?: string; embeddable?: boolean };
      contentDetails?: { duration?: string };
    }>;
  };
  const item = data.items?.[0];
  if (!item || item.status?.privacyStatus !== "public" || item.status.embeddable === false) {
    throw new Error("VIDEO_NOT_EMBEDDABLE");
  }
  return {
    title: (item.snippet?.title ?? "YouTube video").slice(0, 200),
    description: (item.snippet?.description ?? "").slice(0, 2000) || null,
    channelTitle: (item.snippet?.channelTitle ?? "").slice(0, 150) || null,
    thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
    duration: item.contentDetails?.duration ?? null,
  };
}

const teacherRoles = new Set(["teacher", "admin", "super_admin"]);

export async function GET(request: Request) {
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const mine = searchParams.get("mine") === "true";
  const review = searchParams.get("review") === "true";
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 24));
  const cursor = searchParams.get("before");
  const before = cursor ? new Date(cursor) : null;
  const query: Record<string, unknown> = { };

  if (review) {
    if (!teacherRoles.has(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    query.status = "pending";
  } else if (mine) {
    query.suggestedBy = toObjectId(user.id);
  } else {
    query.status = "approved";
    if (user.role === "student") {
      const profile = await col(db, "users").findOne({ _id: toObjectId(user.id) } as never);
      const grade = typeof profile?.classGrade === "string" ? profile.classGrade.trim() : "";
      const gradeNumber = grade.match(/\\d{1,2}/)?.[0];
      query.$or = grade
        ? [
            { targetGrades: "*" },
            { targetGrades: grade },
            ...(gradeNumber ? [{ targetGrades: gradeNumber }, { targetGrades: `Grade ${gradeNumber}` }] : []),
          ]
        : [{ targetGrades: "*" }];
    }
  }
  if (before && Number.isFinite(before.getTime())) query.createdAt = { $lt: before };

  const rows = await col<YouTubeSuggestionDoc>(db, "youtubeSuggestions")
    .find(query as never)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return NextResponse.json({
    suggestions: page.map((row) => ({
      id: row._id.toHexString(),
      videoId: row.videoId,
      url: row.url,
      title: row.title,
      description: row.description,
      thumbnailUrl: row.thumbnailUrl,
      channelTitle: row.channelTitle,
      duration: row.duration,
      status: row.status,
      targetGrades: row.targetGrades,
      reviewReason: row.reviewReason,
      note: row.suggestionNote,
      createdAt: row.createdAt.toISOString(),
    })),
    hasMore,
    cursor: page.length ? page[page.length - 1].createdAt.toISOString() : null,
  });
}

export async function POST(request: Request) {
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  if (user.role !== "student") return NextResponse.json({ error: "Only students can submit video suggestions." }, { status: 403 });
  const limited = guardRate(request, user.id, "uploads");
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const videoId = youtubeIdFromUrl(parsed.data.url);
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Enter a valid YouTube video URL." }, { status: 400 });
  }
  let metadata;
  try {
    metadata = await getYouTubeMetadata(videoId);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = code === "YOUTUBE_NOT_CONFIGURED" ? 503 : code === "VIDEO_NOT_EMBEDDABLE" ? 422 : 502;
    const message = code === "YOUTUBE_NOT_CONFIGURED"
      ? "YouTube integration is not configured yet."
      : code === "VIDEO_NOT_EMBEDDABLE"
        ? "This video is private, unavailable, or cannot be embedded."
        : "YouTube could not verify this video. Please try again.";
    return NextResponse.json({ error: message }, { status });
  }

  const existing = await col<YouTubeSuggestionDoc>(db, "youtubeSuggestions").findOne({
    videoId,
  } as never);
  if (existing) return NextResponse.json({ error: "This video has already been suggested or approved." }, { status: 409 });

  const now = new Date();
  let inserted;
  try {
    inserted = await col<YouTubeSuggestionDoc>(db, "youtubeSuggestions").insertOne({
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    ...metadata,
    suggestedBy: toObjectId(user.id),
    suggestedByRole: user.role,
    suggestionNote: parsed.data.note?.trim().slice(0, 500) || null,
    status: "pending",
    targetGrades: [],
    reviewReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
    } as never);
  } catch (error) {
    if (error instanceof Error && /duplicate key/i.test(error.message)) {
      return NextResponse.json({ error: "This video has already been suggested." }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({ success: true, id: inserted.insertedId.toHexString(), status: "pending" }, { status: 201 });
}
