import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import {
  ensureIndexes,
  col,
  type ConversationDoc,
  type ConversationMemberDoc,
} from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { addGroupMembers, isConversationMember } from "@/lib/db/chat";
import { resolveAuthors } from "@/lib/db/authors";
import { createNotification } from "@/lib/db/notifications";
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

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  if (!(await isConversationMember(db, id, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await col<ConversationMemberDoc>(db, "chatMembers")
    .find({ conversationId: toObjectId(id) } as never)
    .sort({ joinedAt: 1 })
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.userId));

  return NextResponse.json({
    // Deleted/unknown users resolve to null — emit an explicit shape with the
    // member's userId instead of spreading null (which would drop the id).
    members: rows.map((r) => {
      const author = authors.get(r.userId.toHexString());
      return {
        ...(author ?? {
          id: r.userId.toHexString(),
          username: "Deleted user",
          displayName: "Deleted user",
          avatarUrl: null,
        }),
        role: r.role,
        joined_at: r.joinedAt,
      };
    }),
  });
}

const addSchema = z.object({ userIds: z.array(objectIdSchema).min(1, "User IDs required") });

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const validated = addSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: "User IDs required" }, { status: 400 });
  }

  const conversation = await col<ConversationDoc>(db, "chatConversations").findOne({
    _id: toObjectId(id),
  } as never);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (conversation.type !== "group") {
    return NextResponse.json(
      { error: "Can only add members to group conversations" },
      { status: 400 }
    );
  }

  const added = await addGroupMembers(db, id, user.id, validated.data.userIds);
  if (!added.ok) {
    if (added.reason === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (added.reason === "unknown_user") {
      return NextResponse.json({ error: "One or more users not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  for (const targetId of validated.data.userIds) {
    if (targetId !== user.id) {
      await createNotification(db, {
        recipientId: targetId,
        actorId: user.id,
        type: "message",
        title: "Added to group",
        message: "added you to a group conversation",
        data: { conversation_id: id },
      });
    }
  }

  return NextResponse.json({ success: true, added: added.added });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  let memberId = searchParams.get("userId");
  if (!memberId) {
    try {
      const body = await request.json();
      memberId = body?.userId ?? null;
    } catch {
      // no body
    }
  }
  if (!memberId || !objectIdSchema.safeParse(memberId).success) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const cid = toObjectId(id);
  const mine = await col<ConversationMemberDoc>(db, "chatMembers").findOne({
    conversationId: cid,
    userId: toObjectId(user.id),
  } as never);
  const conversation = await col<ConversationDoc>(db, "chatConversations").findOne({
    _id: cid,
  } as never);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const isCreator = conversation.createdBy.equals(toObjectId(user.id));
  const isAdmin = mine?.role === "admin";
  const isSelf = memberId === user.id;
  if (!isSelf && !isCreator && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (memberId === conversation.createdBy.toHexString() && !isCreator) {
    return NextResponse.json({ error: "Cannot remove creator" }, { status: 403 });
  }

  await col<ConversationMemberDoc>(db, "chatMembers").deleteOne({
    conversationId: cid,
    userId: toObjectId(memberId),
  } as never);
  return NextResponse.json({ success: true });
}
