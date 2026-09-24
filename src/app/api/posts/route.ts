import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type PendingMediaDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { postCreateSchema } from "@/lib/validation";
import { createPost, deleteOwnPost, getPost, listPosts, removePost } from "@/lib/db/posts";
import { findUserByUsername } from "@/lib/db/users";
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

export async function GET(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db } = ctx;

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);
  const author = searchParams.get("author");
  const filter = searchParams.get("filter"); // "following" | undefined

  let authorId: string | undefined;
  if (author) {
    const profile = await findUserByUsername(db, author);
    if (!profile) return NextResponse.json({ posts: [] });
    authorId = profile._id.toHexString();
  }

  let before: Date | undefined;
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) before = parsed;
  }

  // Honest deterministic filters: chronological everywhere; "following"
  // scopes to followed users (empty follow graph => empty list, not faked).
  if (filter === "following") {
    const follows = await col(db, "follows").find({ followerId: toObjectId(ctx.user.id) } as never).project({ followingId: 1 }).limit(500).toArray();
    const ids = follows.map((f) => (f as unknown as Record<string, { toHexString(): string }>).followingId);
    if (ids.length === 0) return NextResponse.json({ posts: [] });
    const posts = await listPosts(db, { authorIds: ids.map((o) => String(o)), before, limit });
    return NextResponse.json({
      posts: posts.map((p) => toPostJSON(p as unknown as Record<string, unknown>)),
    });
  }

  const posts = await listPosts(db, { authorId, before, limit });
  return NextResponse.json({
    posts: posts.map((p) => toPostJSON(p as unknown as Record<string, unknown>)),
  });
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const formData = await request.formData();
  const content = formData.get("content") as string;
  const mediaIds = formData.getAll("mediaIds") as string[];

  const validated = postCreateSchema.safeParse({ content, mediaIds });
  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  if (!validated.data.content?.trim() && (!validated.data.mediaIds || validated.data.mediaIds.length === 0)) {
    return NextResponse.json(
      { error: { content: ["Post must include text or media"] } },
      { status: 400 }
    );
  }

  if (validated.data.mediaIds && validated.data.mediaIds.length > 4) {
    return NextResponse.json(
      { error: { mediaIds: ["Maximum 4 attachments per post"] } },
      { status: 400 }
    );
  }

  // Claim staged uploads (ownership verified: only the uploader's rows).
  const media: Array<{ url: string; mediaType: "image" | "video"; thumbnailUrl: string | null; orderIndex: number }> = [];
  if (validated.data.mediaIds && validated.data.mediaIds.length > 0) {
    for (const [index, rawId] of validated.data.mediaIds.entries()) {
      if (!objectIdSchema.safeParse(rawId).success) continue;
      const staged = await col<PendingMediaDoc>(db, "pendingMedia").findOneAndDelete({
        _id: toObjectId(rawId),
        uploaderId: toObjectId(user.id),
      } as never);
      if (!staged) continue;
      media.push({
        url: staged.url,
        mediaType: staged.mediaType,
        thumbnailUrl: staged.thumbnailUrl,
        orderIndex: index,
      });
    }
  }

  const created = await createPost(db, {
    authorId: user.id,
    content: validated.data.content ?? null,
    media,
  });
  if (!created.ok) {
    return NextResponse.json(
      { error: { content: ["Post must include text or media"] } },
      { status: 400 }
    );
  }

  const row = await getPost(db, created.postId);
  if (!row) return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  return NextResponse.json({ post: toPostJSON(row as unknown as Record<string, unknown>) });
}

export async function DELETE(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("id");

  if (!postId || !objectIdSchema.safeParse(postId).success) {
    return NextResponse.json({ error: "Post ID required" }, { status: 400 });
  }

  // Owner path first; admins may remove anything.
  if (await deleteOwnPost(db, postId, user.id)) {
    return NextResponse.json({ success: true });
  }
  if (user.role === "admin" && (await removePost(db, postId))) {
    return NextResponse.json({ success: true });
  }

  // Distinguish missing (404) from forbidden (403).
  const exists = await col(db, "posts").findOne({ _id: toObjectId(postId) } as never);
  if (!exists) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
