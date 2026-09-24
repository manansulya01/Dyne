import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import {
  ensureIndexes,
  col,
  type ConversationDoc,
  type ConversationMemberDoc,
} from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "@/lib/db/authors";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

interface Params {
  params: Promise<{ id: string }>;
}

async function authed(rawId: string) {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    if (!objectIdSchema.safeParse(rawId).success) {
      return { db, error: NextResponse.json({ error: "Conversation not found" }, { status: 404 }) };
    }
    return { db, user };
  } catch (err) {
    const { status, message } = toHttpError(err);
    return { db, error: NextResponse.json({ error: message }, { status }) };
  }
}

async function fullConversation(
  db: Awaited<ReturnType<typeof getDb>>,
  conversationId: string
) {
  const convo = await col<ConversationDoc>(db, "chatConversations").findOne({
    _id: toObjectId(conversationId),
  } as never);
  if (!convo) return null;
  const members = await col<ConversationMemberDoc>(db, "chatMembers")
    .find({ conversationId: convo._id } as never)
    .toArray();
  const authors = await resolveAuthors(db, members.map((m) => m.userId));
  return {
    id: convo._id.toHexString(),
    type: convo.type,
    name: convo.name,
    image_url: convo.imageUrl,
    created_by: convo.createdBy.toHexString(),
    created_at: convo.createdAt,
    updated_at: convo.updatedAt,
    members: members.map((m) => ({
      user_id: m.userId.toHexString(),
      user: authors.get(m.userId.toHexString()) ?? null,
      role: m.role,
      joined_at: m.joinedAt,
      last_read_at: m.lastReadAt,
    })),
  };
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const full = await fullConversation(db, id);
  if (!full) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  const isMember = full.members.some((m) => m.user_id === user.id);
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ conversation: full });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const { name, image_url } = (body ?? {}) as { name?: unknown; image_url?: unknown };

  const convo = await col<ConversationDoc>(db, "chatConversations").findOne({
    _id: toObjectId(id),
  } as never);
  if (!convo) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const membership = await col<ConversationMemberDoc>(db, "chatMembers").findOne({
    conversationId: convo._id,
    userId: toObjectId(user.id),
  } as never);

  const isCreator = convo.createdBy.equals(toObjectId(user.id));
  if (!membership || (!isCreator && !(convo.type === "group" && membership.role === "admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    updates.name = name.trim();
  }
  if (image_url !== undefined) {
    if (image_url !== null) {
      if (
        typeof image_url !== "string" ||
        image_url.length > 2000 ||
        (!image_url.startsWith("/api/files/") &&
          !image_url.startsWith("http://") &&
          !image_url.startsWith("https://"))
      ) {
        return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
      }
    }
    updates.imageUrl = image_url;
  }

  await col<ConversationDoc>(db, "chatConversations").updateOne(
    { _id: convo._id } as never,
    { $set: updates }
  );
  return NextResponse.json({ conversation: await fullConversation(db, id) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const convo = await col<ConversationDoc>(db, "chatConversations").findOne({
    _id: toObjectId(id),
  } as never);
  if (!convo) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (!convo.createdBy.equals(toObjectId(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cid = convo._id;
  await Promise.all([
    col<ConversationDoc>(db, "chatConversations").deleteOne({ _id: cid } as never),
    col<ConversationMemberDoc>(db, "chatMembers").deleteMany({ conversationId: cid } as never),
    col(db, "chatMessages").deleteMany({ conversationId: cid } as never),
  ]);
  return NextResponse.json({ success: true });
}
