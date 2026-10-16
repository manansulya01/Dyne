import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { setPostPinned } from "@/lib/db/communities";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/permissions";

interface Params {
  params: Promise<{ id: string }>;
}

const pinSchema = z.object({ pinned: z.boolean() });

/** Pin/unpin a community discussion (owner, community admin/moderator, platform admin). */
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
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const validated = pinSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const result = await setPostPinned(db, id, user.id, validated.data.pinned, isAdminRole(user.role));
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Post not found" }, { status: 404 });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
