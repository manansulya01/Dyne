import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { getPost, getPostsByIds } from "@/lib/db/posts";
import { savePost, unsavePost } from "@/lib/db/reactions";
import { toPostJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";

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

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const postId = body?.postId;

  if (!postId || !objectIdSchema.safeParse(postId).success) {
    return NextResponse.json({ error: "Post ID required" }, { status: 400 });
  }

  const post = await getPost(db, postId);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const saved = await savePost(db, user.id, postId);
  if ("already" in saved) {
    return NextResponse.json({ error: "Already saved" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("postId");

  if (!postId || !objectIdSchema.safeParse(postId).success) {
    return NextResponse.json({ error: "Post ID required" }, { status: 400 });
  }

  await unsavePost(db, user.id, postId);
  return NextResponse.json({ success: true });
}

export async function GET(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);

  const filter: Record<string, unknown> = { userId: toObjectId(user.id) };
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) filter.createdAt = { $lt: parsed };
  }

  const rows = await col(db, "savedPosts")
    .find(filter as never)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  const posts = await getPostsByIds(
    db,
    rows.map((sp) => (sp.postId as unknown as string))
  );
  const byId = new Map(
    posts.map((p) => [String((p as unknown as Record<string, unknown>).id), p])
  );
  const result = rows
    .map((sp) => {
      const post = byId.get(String(sp.postId));
      if (!post) return null;
      return {
        ...toPostJSON(post as unknown as Record<string, unknown>),
        saved_at: sp.createdAt,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ posts: result });
}
