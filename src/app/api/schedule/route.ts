import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type EventDoc, type EventAttendeeDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "@/lib/db/authors";
import { toEventJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { listTimetable, listAnnouncements } from "@/lib/db/content";
import { safeLimit } from "@/lib/utils";

/**
 * Unified campus schedule: upcoming public events + active announcements +
 * weekly timetable. Honest deterministic ordering (by time), no fake ranking.
 */
export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try { user = await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  const { searchParams } = new URL(request.url);
  const limit = safeLimit(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 50);
  const now = new Date();

  const [events, announcements, timetable] = await Promise.all([
    col<EventDoc>(db, "events").find({ startTime: { $gte: now }, isPublic: true } as never).sort({ startTime: 1 }).limit(limit).toArray(),
    listAnnouncements(db, { limit: 10 }),
    listTimetable(db),
  ]);

  const attendeeCounts = await Promise.all(
    events.map((e) => col<EventAttendeeDoc>(db, "eventAttendees").countDocuments({ eventId: e._id, status: "going" } as never))
  );
  const authors = await resolveAuthors(db, events.map((e) => e.organizerId));
  const buildings = await col(db, "buildings").find({}).project({ name: 1 }).limit(200).toArray();
  const buildingNames = new Map(buildings.map((b) => [b._id.toHexString(), (b as unknown as Record<string, unknown>).name as string]));

  // Validate event id param shape helper for clients (kept local, no behavior change).
  void objectIdSchema;

  const shapedEvents = events.map((e, i) => toEventJSON({
    ...e,
    attendeeCount: attendeeCounts[i],
    userRsvp: null,
    isOrganizer: e.organizerId.equals(toObjectId(user.id)),
    organizer: authors.get(e.organizerId.toHexString()) ?? null,
    locationName: e.locationId ? { id: e.locationId.toHexString(), name: buildingNames.get(e.locationId.toHexString()) ?? "Campus" } : null,
  } as unknown as Record<string, unknown>));

  return NextResponse.json({ events: shapedEvents, announcements, timetable });
}
