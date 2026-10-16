import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { createChannel, listChannels } from "@/lib/db/channels";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/permissions";

interface Params {
  params: Promise<{ id: string }>;
}

const createSchema = z.object({
  name: z.string().min(2).max(40),
  topic: z.string().max(140).optional(),
});

export async function GET(_request: Request, { params }: Params) {
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
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }
  const result = await listChannels(db, id, user.id, { isPlatformAdmin: isAdminRole(user.role) });
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Community not found" }, { status: 404 });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ channels: result.channels });
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
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const validated = createSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const result = await createChannel(db, id, user.id, validated.data, isAdminRole(user.role));
  if (!result.ok) {
    const map: Record<string, [string, number]> = {
      not_found: ["Community not found", 404],
      forbidden: ["Forbidden", 403],
      bad_name: ["Channel names need 2–40 letters, numbers, spaces, _ or -", 400],
      name_taken: ["A channel with that name already exists", 409],
      too_many: ["Channel limit reached", 400],
    };
    const [message, status] = map[result.reason] ?? ["Could not create channel", 400];
    return NextResponse.json({ error: message }, { status });
  }
  const listed = await listChannels(db, id, user.id, { isPlatformAdmin: isAdminRole(user.role) });
  const channel = listed.ok ? listed.channels.find((c) => String((c as unknown as Record<string, unknown>).id) === result.channelId.toHexString()) : null;
  return NextResponse.json({ channel }, { status: 201 });
}
