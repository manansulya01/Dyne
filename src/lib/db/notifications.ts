import { Db, ObjectId } from "mongodb";
import { col, type NotificationDoc, type NotificationType } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";

export interface CreateNotificationInput {
  recipientId: string | ObjectId;
  actorId?: string | ObjectId | null;
  type: NotificationType;
  title: string;
  message?: string | null;
  data?: Record<string, unknown> | null;
}

export async function createNotification(db: Db, input: CreateNotificationInput) {
  const res = await col<NotificationDoc>(db, "notifications").insertOne({
    recipientId: toObjectId(input.recipientId),
    actorId: input.actorId ? toObjectId(input.actorId) : null,
    type: input.type,
    title: input.title,
    message: input.message ?? null,
    data: input.data ?? null,
    readAt: null,
    createdAt: new Date(),
  } as never);
  return res.insertedId;
}

export async function listNotifications(
  db: Db,
  recipientId: string | ObjectId,
  opts: { limit?: number; before?: Date; unreadOnly?: boolean } = {}
) {
  const limit = safeLimit(opts.limit, 50);
  const filter: Record<string, unknown> = { recipientId: toObjectId(recipientId) };
  if (opts.before) filter.createdAt = { $lt: opts.before };
  if (opts.unreadOnly) filter.readAt = null;
  const rows = await col<NotificationDoc>(db, "notifications")
    .find(filter as never)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  // Attach actor profiles in one batched query.
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as ObjectId[];
  const actors = actorIds.length
    ? await col(db, "users")
        .find({ _id: { $in: actorIds } } as never)
        .project({ username: 1, displayName: 1, avatarUrl: 1 })
        .toArray()
    : [];
  const byId = new Map(actors.map((a) => [a._id.toHexString(), a]));
  return serializeMany(
    rows.map((r) => ({
      ...r,
      actor: r.actorId ? byId.get(r.actorId.toHexString()) ?? null : null,
    }))
  );
}

export async function unreadCount(db: Db, recipientId: string | ObjectId) {
  return col<NotificationDoc>(db, "notifications").countDocuments({
    recipientId: toObjectId(recipientId),
    readAt: null,
  } as never);
}

export async function markNotificationRead(db: Db, recipientId: string | ObjectId, id: string | ObjectId) {
  const res = await col<NotificationDoc>(db, "notifications").updateOne(
    { _id: toObjectId(id), recipientId: toObjectId(recipientId), readAt: null } as never,
    { $set: { readAt: new Date() } }
  );
  return res.matchedCount === 1;
}

export async function markAllNotificationsRead(db: Db, recipientId: string | ObjectId) {
  const res = await col<NotificationDoc>(db, "notifications").updateMany(
    { recipientId: toObjectId(recipientId), readAt: null } as never,
    { $set: { readAt: new Date() } }
  );
  return res.modifiedCount;
}
