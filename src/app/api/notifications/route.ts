import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadCount,
} from "@/lib/db/notifications";
import { toNotificationJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";

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
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);
  const unreadOnly = searchParams.get("unread") === "true";

  let before: Date | undefined;
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) before = parsed;
  }

  const [notifications, unread] = await Promise.all([
    listNotifications(db, user.id, { limit, before, unreadOnly }),
    unreadCount(db, user.id),
  ]);

  const mapped = notifications.map((n) => toNotificationJSON(n as unknown as Record<string, unknown>));
  return NextResponse.json({
    notifications: mapped,
    unreadCount: unread,
    cursor: mapped.length ? mapped[mapped.length - 1].created_at : null,
    hasMore: mapped.length === limit,
  });
}

export async function PATCH(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => ({}));
  const { id, all } = (body ?? {}) as { id?: string; all?: unknown };

  if (all === true) {
    await markAllNotificationsRead(db, user.id);
    return NextResponse.json({ success: true });
  }
  if (!id || !objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Notification ID required" }, { status: 400 });
  }
  await markNotificationRead(db, user.id, id);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id || !objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Notification ID required" }, { status: 400 });
  }

  await col(db, "notifications").deleteOne({
    _id: toObjectId(id),
    recipientId: toObjectId(user.id),
  } as never);
  return NextResponse.json({ success: true });
}
