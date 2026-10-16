import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { createConversation, listConversations } from "@/lib/db/chat";
import { toConversationJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import { rateLimit, clientKey, RATE_PRESETS } from "@/lib/security/rateLimit";

const createSchema = z.object({
  participantIds: z.array(objectIdSchema).min(1, "Participant IDs required").max(50),
  type: z.enum(["group"]).default("group"),
  name: z.string().max(100).optional(),
  communityId: objectIdSchema.optional(),
  channelId: objectIdSchema.optional(),
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

export async function GET(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);

  const conversations = await listConversations(db, user.id, limit);
  const mapped = conversations.map((c) =>
    toConversationJSON(c as unknown as Record<string, unknown>)
  );

  return NextResponse.json({
    conversations: mapped,
    cursor: mapped.length ? mapped[mapped.length - 1].updated_at : null,
    hasMore: mapped.length === limit,
  });
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const rl = rateLimit(`conversations:${clientKey(request, user.id)}`, RATE_PRESETS.spaces.limit, RATE_PRESETS.spaces.windowMs);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  // Product rule: student-to-student DMs are disabled. Reject legacy direct
  // creation attempts explicitly (fail safely, do not silently convert).
  if (body && typeof body === "object" && (body as Record<string, unknown>).type === "direct") {
    return NextResponse.json(
      { error: "Direct messages are disabled. Use community group chats." },
      { status: 403 }
    );
  }
  const validated = createSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: "Participant IDs required" }, { status: 400 });
  }

  const created = await createConversation(db, user.id, {
    type: "group",
    participantIds: validated.data.participantIds,
    name: validated.data.name,
    communityId: validated.data.communityId ?? null,
    channelId: validated.data.channelId ?? null,
  });

  if (!created.ok) {
    const messages: Record<string, string> = {
      direct_disabled: "Direct messages are disabled. Select at least 2 people for a group chat, or start from a community or channel.",
      direct_needs_one: "Direct conversations require exactly 1 participant",
      no_participants: "Participant IDs required",
      unknown_user: "User not found",
      unknown_community: "Community not found",
      unknown_channel: "Channel not found",
      channel_mismatch: "Channel does not belong to this community",
      not_community_member: "You must join the community first",
    };
    const status =
      created.reason === "unknown_user" || created.reason === "unknown_community" || created.reason === "unknown_channel"
        ? 404
        : created.reason === "direct_disabled" || created.reason === "not_community_member" || created.reason === "channel_mismatch"
          ? 403
          : 400;
    return NextResponse.json(
      { error: messages[created.reason] ?? "Could not create conversation" },
      { status }
    );
  }

  // Return the full conversation shape (deduped direct convos included).
  const conversations = await listConversations(db, user.id, 50);
  const full = conversations.find(
    (c) => String((c as unknown as Record<string, unknown>).id) === created.conversationId.toHexString()
  );
  return NextResponse.json({
    conversation: full
      ? toConversationJSON(full as unknown as Record<string, unknown>)
      : { id: created.conversationId.toHexString() },
  });
}
