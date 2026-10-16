import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { deleteChannel, renameChannel } from "@/lib/db/channels";
import { logAudit } from "@/lib/security/audit";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/permissions";

interface Params {
  params: Promise<{ id: string; channelId: string }>;
}

const renameSchema = z.object({
  name: z.string().min(2).max(40).optional(),
  topic: z.string().max(140).nullable().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const { channelId } = await params;
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!objectIdSchema.safeParse(channelId).success) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const validated = renameSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const result = await renameChannel(db, channelId, user.id, validated.data, isAdminRole(user.role));
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    if (result.reason === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (result.reason === "name_taken") return NextResponse.json({ error: "A channel with that name already exists" }, { status: 409 });
    return NextResponse.json({ error: "Invalid channel name" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { channelId } = await params;
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!objectIdSchema.safeParse(channelId).success) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  const result = await deleteChannel(db, channelId, user.id, isAdminRole(user.role));
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    if (result.reason === "last_channel") {
      return NextResponse.json({ error: "A community must keep at least one channel" }, { status: 400 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await logAudit(db, {
    actorId: user.id,
    action: "community.channel.delete",
    targetType: "channel",
    targetId: channelId,
  });
  return NextResponse.json({ success: true });
}
