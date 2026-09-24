import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type MessageDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { messageCreateSchema } from "@/lib/validation";
import { listMessages, sendMessage } from "@/lib/db/chat";
import { createNotification } from "@/lib/db/notifications";
import { toMessageJSON } from "@/lib/db/contracts";
import { parseLimitParam } from "@/lib/utils";
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

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const limit = parseLimitParam(searchParams.get("limit"), 50, 100);

  const result = await listMessages(db, id, user.id, limit);
  if (!result.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const mapped = result.messages.map((m) =>
    toMessageJSON(m as unknown as Record<string, unknown>)
  );
  return NextResponse.json({
    messages: mapped,
    cursor: mapped.length ? mapped[0].created_at : null,
    hasMore: mapped.length === limit,
  });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const validated = messageCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // The body's conversation id must match the route — never trust either alone.
  if (validated.data.conversationId !== id) {
    return NextResponse.json({ error: "Conversation mismatch" }, { status: 400 });
  }

  const sent = await sendMessage(db, id, user.id, validated.data.content, []);
  if (!sent.ok) {
    if (sent.reason === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (sent.reason === "too_long") {
      return NextResponse.json({ error: "Message too long" }, { status: 400 });
    }
    return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  }

  const row = await col<MessageDoc>(db, "chatMessages").findOne({ _id: sent.messageId } as never);

  // Fan out to other members (best effort; message itself already persisted).
  // Membership was verified by sendMessage above.
  const others = await col(db, "chatMembers")
    .find({ conversationId: toObjectId(id) } as never)
    .project({ userId: 1 })
    .toArray();
  await Promise.all(
    others
      .filter((m) => !m.userId.equals(toObjectId(user.id)))
      .map((m) =>
        createNotification(db, {
          recipientId: m.userId,
          actorId: user.id,
          type: "message",
          title: "New message",
          message: "sent you a message",
          data: { conversation_id: id },
        })
      )
  );

  return NextResponse.json({
    message: row ? toMessageJSON(row as unknown as Record<string, unknown>) : { id: sent.messageId.toHexString() },
  });
}
