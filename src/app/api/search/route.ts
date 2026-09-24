import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { globalSearch } from "@/lib/db/search";
import { toCommunityJSON, toVideoJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

function shapeAuthor(a: unknown) {
  if (!a || typeof a !== "object") return null;
  const r = a as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    username: String(r.username ?? ""),
    display_name: (r.displayName ?? null) as string | null,
    avatar_url: (r.avatarUrl ?? null) as string | null,
  };
}

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const { searchParams } = new URL(request.url);
  const results = await globalSearch(db, searchParams.get("q") || "", {
    userId: user.id,
    isAdmin: user.role === "admin",
  });

  return NextResponse.json({
    people: (results.people as Array<Record<string, unknown>>).map((p) => ({
      id: String(p.id),
      username: p.username,
      display_name: p.displayName ?? null,
      avatar_url: p.avatarUrl ?? null,
      role: p.role,
    })),
    posts: (results.posts as Array<Record<string, unknown>>).map((p) => ({
      id: String(p.id),
      content: p.content ?? null,
      created_at: p.createdAt,
      author: shapeAuthor(p.author),
    })),
    communities: (results.communities as Array<Record<string, unknown>>).map((c) =>
      toCommunityJSON(c)
    ),
    events: (results.events as Array<Record<string, unknown>>).map((e) => ({
      id: String(e.id),
      title: e.title,
      description: e.description ?? null,
      start_time: e.startTime,
      image_url: e.imageUrl ?? null,
    })),
    buildings: (results.buildings as Array<Record<string, unknown>>).map((b) => ({
      id: String(b.id),
      name: b.name,
      description: b.description ?? null,
      image_url: b.imageUrl ?? null,
    })),
    clubs: (results.clubs as Array<Record<string, unknown>>).map((c) => ({
      id: String(c.id),
      name: c.name,
      description: c.description ?? null,
      image_url: c.imageUrl ?? null,
      category: c.category ?? null,
    })),
    videos: (results.videos as Array<Record<string, unknown>>).map((v) =>
      toVideoJSON(v)
    ),
    blogs: (results.blogs as Array<Record<string, unknown>>).map((b) => ({
      id: String(b.id),
      slug: b.slug,
      title: b.title,
      excerpt: b.excerpt ?? null,
      cover_image_url: b.coverImageUrl ?? null,
      category: b.category ?? null,
    })),
  });
}
