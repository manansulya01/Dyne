import { Db, ObjectId } from "mongodb";
import {
  col,
  type EventDoc,
  type EventAttendeeDoc,
  type RsvpStatus,
  type UserRole,
} from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
import { serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";

const CREATOR_ROLES: UserRole[] = ["admin", "teacher", "staff", "club"];

export function canCreateEvents(role: UserRole): boolean {
  return CREATOR_ROLES.includes(role);
}

export interface CreateEventInput {
  title: string;
  description?: string | null;
  locationId?: string | ObjectId | null;
  startTime: Date;
  endTime: Date;
  isPublic?: boolean;
  maxAttendees?: number | null;
}

export async function createEvent(
  db: Db,
  organizerId: string | ObjectId,
  organizerRole: UserRole,
  input: CreateEventInput
) {
  if (!canCreateEvents(organizerRole)) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  if (input.title.trim().length < 3 || input.title.length > 200) {
    return { ok: false as const, reason: "bad_title" as const };
  }
  if (!(input.startTime instanceof Date && !isNaN(+input.startTime))) {
    return { ok: false as const, reason: "bad_start" as const };
  }
  if (!(input.endTime instanceof Date && !isNaN(+input.endTime)) || input.endTime <= input.startTime) {
    return { ok: false as const, reason: "bad_end" as const };
  }
  let locationId: ObjectId | null = null;
  if (input.locationId) {
    try {
      locationId = toObjectId(input.locationId);
    } catch {
      return { ok: false as const, reason: "bad_location" as const };
    }
    const building = await col(db, "buildings").findOne({ _id: locationId } as never);
    if (!building) return { ok: false as const, reason: "bad_location" as const };
  }
  const now = new Date();
  const res = await col<EventDoc>(db, "events").insertOne({
    title: input.title.trim(),
    description: input.description?.trim() || null,
    imageUrl: null,
    locationId,
    startTime: input.startTime,
    endTime: input.endTime,
    organizerId: toObjectId(organizerId),
    isPublic: input.isPublic ?? true,
    maxAttendees: input.maxAttendees ?? null,
    goingCount: 0,
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, eventId: res.insertedId };
}

export async function listEvents(
  db: Db,
  userId: string | ObjectId,
  limit = 50,
  opts?: { cursor?: string | null; isAdmin?: boolean }
) {
  const uid = toObjectId(userId);
  const clamped = safeLimit(limit, 50);
  // Private events are visible only to the organizer, attendees, and admins.
  let visibility: Record<string, unknown> = { isPublic: true };
  if (opts?.isAdmin) {
    visibility = {};
  } else {
    const attended = await col<EventAttendeeDoc>(db, "eventAttendees")
      .find({ userId: uid } as never)
      .project({ eventId: 1 })
      .toArray();
    const attendedIds = attended.map((a) => a.eventId);
    visibility = {
      $or: [
        { isPublic: true },
        { organizerId: uid },
        { _id: { $in: attendedIds } },
      ],
    };
  }
  const filter: Record<string, unknown> = { ...visibility };
  if (opts?.cursor) {
    const parsed = new Date(opts.cursor);
    if (!isNaN(+parsed)) filter.startTime = { $gt: parsed };
  }
  const rows = await col<EventDoc>(db, "events")
    .find(filter as never)
    .sort({ startTime: 1 })
    .limit(clamped)
    .toArray();
  const ids = rows.map((e) => e._id);
  const [counts, mine] = await Promise.all([
    col<EventAttendeeDoc>(db, "eventAttendees")
      .aggregate([
        { $match: { eventId: { $in: ids }, status: "going" } },
        { $group: { _id: "$eventId", n: { $sum: 1 } } },
      ])
      .toArray(),
    col<EventAttendeeDoc>(db, "eventAttendees")
      .find({ eventId: { $in: ids }, userId: toObjectId(userId) } as never)
      .toArray(),
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.n as number]));
  const rsvpMap = new Map(mine.map((m) => [m.eventId.toHexString(), m.status]));
  const authors = await resolveAuthors(db, rows.map((e) => e.organizerId));
  return serializeMany(
    rows.map((e) => ({
      ...e,
      attendeeCount: countMap.get(e._id.toHexString()) ?? 0,
      userRsvp: rsvpMap.get(e._id.toHexString()) ?? null,
      isOrganizer: e.organizerId.equals(toObjectId(userId)),
      organizer: authors.get(e.organizerId.toHexString()) ?? null,
    }))
  );
}

/**
 * Atomic RSVP.
 *
 * Capacity is enforced with a denormalized `goingCount` counter on the event
 * document: claiming a seat is a single atomic findOneAndUpdate whose filter
 * includes `goingCount < maxAttendees`, so concurrent RSVPs past capacity
 * cannot both succeed. The attendee row is upserted afterwards; seat release
 * on cancel/status-change decrements the same counter. No check-then-insert
 * race anywhere in this flow.
 */
export async function rsvpEvent(
  db: Db,
  eventId: string | ObjectId,
  userId: string | ObjectId,
  status: RsvpStatus
) {
  const eid = toObjectId(eventId);
  const uid = toObjectId(userId);
  const event = await col<EventDoc>(db, "events").findOne({ _id: eid } as never);
  if (!event) return { ok: false as const, reason: "not_found" as const };
  if (!event.isPublic && !event.organizerId.equals(uid)) {
    return { ok: false as const, reason: "private" as const };
  }

  const attendees = col<EventAttendeeDoc>(db, "eventAttendees");
  const existing = await attendees.findOne({ eventId: eid, userId: uid } as never);
  const wasGoing = existing?.status === "going";

  if (status === "declined") {
    if (wasGoing) await releaseSeat(db, eid);
    await attendees.deleteOne({ eventId: eid, userId: uid } as never);
    return { ok: true as const, status: null };
  }

  // Only "going" consumes capacity.
  if (status === "going" && !wasGoing && event.maxAttendees != null) {
    const claimed = await col<EventDoc>(db, "events").findOneAndUpdate(
      {
        _id: eid,
        $or: [
          { maxAttendees: null },
          { $expr: { $lt: ["$goingCount", "$maxAttendees"] } },
        ],
      } as never,
      { $inc: { goingCount: 1 } },
      { returnDocument: "after" }
    );
    if (!claimed) return { ok: false as const, reason: "full" as const };
  }
  if (wasGoing && status !== "going") {
    await releaseSeat(db, eid);
  }

  await attendees.updateOne(
    { eventId: eid, userId: uid } as never,
    { $set: { status }, $setOnInsert: { eventId: eid, userId: uid, createdAt: new Date() } },
    { upsert: true }
  );
  return { ok: true as const, status };
}

async function releaseSeat(db: Db, eventId: ObjectId): Promise<void> {
  await col<EventDoc>(db, "events").updateOne(
    { _id: eventId, goingCount: { $gt: 0 } } as never,
    { $inc: { goingCount: -1 } }
  );
}

export async function cancelRsvp(db: Db, eventId: string | ObjectId, userId: string | ObjectId) {
  const eid = toObjectId(eventId);
  const removed = await col<EventAttendeeDoc>(db, "eventAttendees").findOneAndDelete({
    eventId: eid,
    userId: toObjectId(userId),
  } as never);
  if (removed?.status === "going") {
    await releaseSeat(db, eid);
  }
  return { ok: true as const };
}
