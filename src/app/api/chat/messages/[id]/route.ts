import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { deleteMessage, editMessage, toggleMessageReaction } from "@/lib/db/chat";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

interface Params {
  params: Promise<{ id: string }>;
}

const editSchema = z.object({ content: z.string().min(1).max(10000) });
const reactionSchema = z.object({ emoji: z.string().min(1).max(16) });

function checkId(id: string) {
  return objectIdSchema.safeParse(id).success;
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!checkId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const validated = editSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: "Invalid content" }, { status: 400 });
  }
  const result = await editMessage(db, id, user.id, user.role, validated.data.content);
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.reason === "direct_disabled") {
      return NextResponse.json({ error: "Direct messages are disabled." }, { status: 403 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!checkId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await deleteMessage(db, id, user.id, user.role);
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.reason === "direct_disabled") {
      return NextResponse.json({ error: "Direct messages are disabled." }, { status: 403 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!checkId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const validated = reactionSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }
  const result = await toggleMessageReaction(db, id, user.id, validated.data.emoji);
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.reason === "bad_emoji") return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ success: true, added: result.added });
}
