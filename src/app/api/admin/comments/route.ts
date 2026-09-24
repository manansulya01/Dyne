import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import { requireAdminUser } from "../stats/route";
import { requirePermission } from "@/lib/permissions";

const commentActionSchema = z.object({
  commentId: objectIdSchema,
  action: z.enum(["remove", "restore"]),
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function requireAdminWithPerm(db: unknown, permission: string) {
  const admin = await requireAdminUser(db as never);
  requirePermission(admin.role, permission as never);
  return admin;
}

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireAdminWithPerm(db, "comments.remove");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").trim().slice(0, 100);
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);
  const showDeleted = searchParams.get("deleted") === "true";

  const filter: Record<string, unknown> = {};
  if (search) {
    const rx = { $regex: escapeRegExp(search), $options: "i" };
    filter.content = rx;
  }
  if (showDeleted) {
    filter.deletedAt = { $ne: null };
  } else {
    filter.deletedAt = null;
  }
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) filter.createdAt = { $lt: parsed };
  }

  const rows = await col(db, "comments")
    .find(filter as never)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return NextResponse.json({ comments: rows });
}

export async function PATCH(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireAdminWithPerm(db, "comments.remove");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const body = await request.json().catch(() => null);
  const validated = commentActionSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }

  const { commentId, action } = validated.data;
  const stamp = { $set: { deletedAt: action === "remove" ? new Date() : null, updatedAt: new Date() } };

  const res = await col(db, "comments").updateOne({ _id: commentId } as never, stamp);
  if (res.matchedCount === 0) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}