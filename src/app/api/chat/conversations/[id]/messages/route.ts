import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type MessageDoc, type PendingMediaDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { messageCreateSchema } from "@/lib/validation";
import { listMessages, sendMessage } from "@/lib/db/chat";
import { createNotification } from "@/lib/db/notifications";
import { toMessageJSON } from "@/lib/db/contracts";
import { parseLimitParam } from "@/lib/utils";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { rateLimit, clientKey, RATE_PRESETS } from "@/lib/security/rateLimit";
import { logAudit } from "@/lib/security/audit";

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

  const result = await listMessages(db, id, user.id, limit, { viewerRole: user.role });
  if (!result.ok) {
    if (result.reason === "direct_disabled") {
      return NextResponse.json(
        { error: "Direct messages are disabled. Use community group chats." },
        { status: 403 }
      );
    }
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

  const rl = rateLimit(`messages:${clientKey(request, user.id)}`, RATE_PRESETS.messages.limit, RATE_PRESETS.messages.windowMs);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

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

  // Claim staged uploads as attachments. Ownership + bucket verified: only
  // the sender's own message-attachments rows can be claimed, and each claim
  // is deleted so ids cannot be reused across messages.
  const attachments: Array<{ url: string; mime: string; fileName: string; size: number }> = [];
  for (const rawId of validated.data.attachmentIds ?? []) {
    if (!objectIdSchema.safeParse(rawId).success) continue;
    const staged = await col<PendingMediaDoc>(db, "pendingMedia").findOneAndDelete({
      _id: toObjectId(rawId),
      uploaderId: toObjectId(user.id),
      bucket: "message-attachments",
    } as never);
    if (!staged) continue;
    attachments.push({
      url: staged.url,
      mime: staged.mime ?? "application/octet-stream",
      fileName: staged.originalName ?? "attachment",
      size: staged.size ?? 0,
    });
  }

  const sent = await sendMessage(db, id, user.id, validated.data.content ?? "", attachments);
  if (!sent.ok) {
    if (sent.reason === "direct_disabled") {
      return NextResponse.json(
        { error: "Direct messages are disabled. Use community group chats." },
        { status: 403 }
      );
    }
    if (sent.reason === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (sent.reason === "blocked") {
      // High-confidence policy violation: nothing is delivered.
      await logAudit(db, {
        actorId: user.id,
        action: "moderation.message.blocked",
        targetType: "conversation",
        targetId: id,
        details: { reason: sent.moderationReason ?? null },
      });
      return NextResponse.json(
        { error: "This message was blocked by campus safety checks." },
        { status: 422 }
      );
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
    moderation: {
      status: sent.moderationStatus,
      // Held messages stay visible to their author but are flagged for review.
      heldForReview: sent.heldForReview,
    },
  });
}
