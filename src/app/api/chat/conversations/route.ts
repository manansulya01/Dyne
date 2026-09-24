import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { createConversation, listConversations } from "@/lib/db/chat";
import { toConversationJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";

const createSchema = z.object({
  participantIds: z.array(objectIdSchema).min(1, "Participant IDs required"),
  type: z.enum(["direct", "group"]).default("direct"),
  name: z.string().max(100).optional(),
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

  const body = await request.json().catch(() => null);
  const validated = createSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: "Participant IDs required" }, { status: 400 });
  }
  if (validated.data.type === "direct" && validated.data.participantIds.length !== 1) {
    return NextResponse.json(
      { error: "Direct conversations require exactly 1 participant" },
      { status: 400 }
    );
  }

  const created = await createConversation(db, user.id, {
    type: validated.data.type,
    participantIds: validated.data.participantIds,
    name: validated.data.name,
  });

  if (!created.ok) {
    const messages: Record<string, string> = {
      direct_needs_one: "Direct conversations require exactly 1 participant",
      no_participants: "Participant IDs required",
      unknown_user: "User not found",
    };
    return NextResponse.json(
      { error: messages[created.reason] ?? "Could not create conversation" },
      { status: created.reason === "unknown_user" ? 404 : 400 }
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
