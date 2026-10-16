import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { createStory, listActiveStories, listStoriesByAuthor } from "@/lib/db/stories";
import { toStoryJSON } from "@/lib/db/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { guardRate, withPermission } from "@/lib/security/authorize";
import { parseLimitParam } from "@/lib/utils";

const storyCreateSchema = z
  .object({
    mediaType: z.enum(["image", "video", "text"]),
    mediaUrl: z.string().min(1).max(2000).optional(),
    text: z.string().trim().max(1000).optional(),
    caption: z.string().trim().max(300).optional(),
    background: z.string().trim().max(50).optional(),
    lifetimeSeconds: z.number().int().min(60).max(7 * 24 * 3600).optional(),
  })
  .refine((d) => d.mediaType === "text" || !!d.mediaUrl, {
    message: "mediaUrl is required for image and video stories",
    path: ["mediaUrl"],
  });

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);

  const { searchParams } = new URL(request.url);
  const authorId = searchParams.get("authorId");
  if (authorId && /^[0-9a-fA-F]{24}$/.test(authorId)) {
    const rows = await listStoriesByAuthor(db, authorId, {
      includePendingFor: user?.id,
      limit: parseLimitParam(searchParams.get("limit"), 30, 50),
    });
    return NextResponse.json({
      stories: rows.map((s) => toStoryJSON(s as unknown as Record<string, unknown>)),
    });
  }

  const { stories, groups } = await listActiveStories(db, {
    limit: parseLimitParam(searchParams.get("limit"), 50, 100),
  });
  return NextResponse.json({
    stories: stories.map((s) => toStoryJSON(s as unknown as Record<string, unknown>)),
    groups: groups.map((g) => ({
      author: g.author,
      stories: g.stories.map((s) => toStoryJSON(s as unknown as Record<string, unknown>)),
    })),
  });
}

export async function POST(request: Request) {
  const auth = await withPermission("stories.create");
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;

  const limited = guardRate(request, user.id, "uploads");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const validated = storyCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const created = await createStory(db, user.id, validated.data);
  if (!created.ok) {
    return NextResponse.json(
      { error: { [created.reason === "bad_text" ? "text" : "mediaUrl"]: ["Invalid story content"] } },
      { status: 400 }
    );
  }
  return NextResponse.json(
    { story: { id: created.storyId.toHexString() }, moderationStatus: created.moderationStatus },
    { status: 201 }
  );
}
