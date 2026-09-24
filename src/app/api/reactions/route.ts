import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type ReactionDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { addReaction, removeReaction } from "@/lib/db/reactions";
import { resolveAuthors } from "@/lib/db/authors";
import { createNotification } from "@/lib/db/notifications";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

const reactionBodySchema = z.object({
  targetType: z.enum(["post", "comment", "video"]),
  targetId: objectIdSchema,
  reactionType: z.enum(["like"]).default("like"),
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

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const validated = reactionBodySchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { targetType, targetId, reactionType } = validated.data;
  const added = await addReaction(db, user.id, targetType, targetId, reactionType);
  if (!added.ok) {
    if (added.reason === "not_found") {
      return NextResponse.json({ error: "Target not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Already reacted" }, { status: 400 });
  }

  if (targetType === "post") {
    const post = await col(db, "posts").findOne({ _id: toObjectId(targetId) } as never);
    if (post && !post.authorId.equals(toObjectId(user.id))) {
      await createNotification(db, {
        recipientId: post.authorId,
        actorId: user.id,
        type: "like",
        title: "New like",
        message: "liked your post",
        data: { post_id: targetId },
      });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId");
  const reactionType = searchParams.get("reactionType") || "like";

  if (
    !targetType ||
    !["post", "comment", "video"].includes(targetType) ||
    !targetId ||
    !objectIdSchema.safeParse(targetId).success
  ) {
    return NextResponse.json({ error: "Target type and ID required" }, { status: 400 });
  }

  await removeReaction(
    db,
    user.id,
    targetType as "post" | "comment" | "video",
    targetId,
    reactionType
  );
  return NextResponse.json({ success: true });
}

export async function GET(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId");

  if (
    !targetType ||
    !["post", "comment", "video"].includes(targetType) ||
    !targetId ||
    !objectIdSchema.safeParse(targetId).success
  ) {
    return NextResponse.json({ error: "Target type and ID required" }, { status: 400 });
  }

  const rows = await col<ReactionDoc>(db, "reactions")
    .find({ targetType, targetId: toObjectId(targetId) } as never)
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
  const authors = await resolveAuthors(
    db,
    rows.map((r) => r.userId)
  );
  const reactions = rows.map((r) => ({
    id: r._id.toHexString(),
    user_id: r.userId.toHexString(),
    target_type: r.targetType,
    target_id: r.targetId.toHexString(),
    reaction_type: r.kind,
    created_at: r.createdAt,
    user: authors.get(r.userId.toHexString()) ?? null,
  }));
  const counts: Record<string, number> = {};
  let userReaction: string | null = null;
  for (const r of rows) {
    counts[r.kind] = (counts[r.kind] || 0) + 1;
    if (userReaction === null && r.userId.equals(toObjectId(user.id))) {
      userReaction = r.kind;
    }
  }

  return NextResponse.json({ reactions, counts, userReaction });
}
