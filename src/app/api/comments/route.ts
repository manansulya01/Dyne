import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { commentCreateSchema } from "@/lib/validation";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import {
  createComment,
  deleteComment,
  listComments,
} from "@/lib/db/comments";
import { getCommentReactionCounts } from "@/lib/db/reactions";
import { createNotification } from "@/lib/db/notifications";
import { toCommentJSON } from "@/lib/db/contracts";
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
  const postId = searchParams.get("postId");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);

  if (!postId || !objectIdSchema.safeParse(postId).success) {
    return NextResponse.json({ error: "Post ID required" }, { status: 400 });
  }

  const comments = await listComments(db, postId, limit);
  const counts = await getCommentReactionCounts(
    db,
    comments.map((c) => String((c as unknown as Record<string, unknown>).id))
  );
  return NextResponse.json({
    comments: comments.map((c) => {
      const row = c as unknown as Record<string, unknown>;
      return toCommentJSON({ ...row, reactionCount: counts.get(String(row.id)) ?? 0 });
    }),
  });
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const validated = commentCreateSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const created = await createComment(
    db,
    validated.data.postId,
    user.id,
    validated.data.content,
    validated.data.parentCommentId ?? null
  );

  if (!created.ok) {
    if (created.reason === "post_not_found") {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (created.reason === "bad_parent") {
      return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
    }
    return NextResponse.json(
      { error: { content: ["Comment cannot be empty"] } },
      { status: 400 }
    );
  }

  // Notify the post author (unless self) about the new comment.
  const post = await col(db, "posts").findOne({ _id: toObjectId(validated.data.postId) } as never);
  if (post && !post.authorId.equals(toObjectId(user.id))) {
    await createNotification(db, {
      recipientId: post.authorId,
      actorId: user.id,
      type: "comment",
      title: "New comment",
      message: "commented on your post",
      data: { post_id: validated.data.postId, comment_id: created.commentId.toHexString() },
    });
  }

  // Notify the parent comment author about the reply (unless self/same as above).
  if (validated.data.parentCommentId) {
    const parent = await col(db, "comments").findOne({
      _id: toObjectId(validated.data.parentCommentId),
    } as never);
    if (
      parent &&
      !parent.authorId.equals(toObjectId(user.id)) &&
      (!post || !parent.authorId.equals(post.authorId))
    ) {
      await createNotification(db, {
        recipientId: parent.authorId,
        actorId: user.id,
        type: "comment",
        title: "New reply",
        message: "replied to your comment",
        data: { post_id: validated.data.postId, comment_id: created.commentId.toHexString() },
      });
    }
  }

  const listed = await listComments(db, validated.data.postId, 50);
  const fresh = listed.find(
    (c) => String((c as unknown as Record<string, unknown>).id) === created.commentId.toHexString()
  );
  return NextResponse.json({
    comment: fresh
      ? toCommentJSON(fresh as unknown as Record<string, unknown>)
      : { id: created.commentId.toHexString() },
  });
}

export async function DELETE(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const commentId = searchParams.get("id");

  if (!commentId || !objectIdSchema.safeParse(commentId).success) {
    return NextResponse.json({ error: "Comment ID required" }, { status: 400 });
  }

  const removed = await deleteComment(db, commentId, user.id, user.role === "admin");
  if (!removed) {
    // Distinguish missing (404) from forbidden (403) without leaking.
    const exists = await col(db, "comments").findOne({ _id: toObjectId(commentId) } as never);
    if (!exists) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
