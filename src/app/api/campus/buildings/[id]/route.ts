import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type EventDoc, type EventAttendeeDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { toBuildingJSON, toEventJSON } from "@/lib/db/contracts";
import { resolveAuthors } from "@/lib/db/authors";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

interface Params { params: Promise<{ id: string }>; }

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
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }
  const building = await col(db, "buildings").findOne({ _id: toObjectId(id) } as never);
  if (!building) return NextResponse.json({ error: "Building not found" }, { status: 404 });

  const events = await col<EventDoc>(db, "events")
    .find({ locationId: building._id } as never)
    .sort({ startTime: 1 })
    .limit(10)
    .toArray();
  const counts = await Promise.all(
    events.map((e) => col<EventAttendeeDoc>(db, "eventAttendees").countDocuments({ eventId: e._id, status: "going" } as never))
  );
  const authors = await resolveAuthors(db, events.map((e) => e.organizerId));

  return NextResponse.json({
    building: toBuildingJSON(building as unknown as Record<string, unknown>),
    events: events.map((e, i) =>
      toEventJSON({
        ...e,
        attendeeCount: counts[i],
        userRsvp: null,
        isOrganizer: e.organizerId.equals(toObjectId(user.id)),
        organizer: authors.get(e.organizerId.toHexString()) ?? null,
        locationName: { id: building._id.toHexString(), name: (building as unknown as Record<string, unknown>).name },
      } as unknown as Record<string, unknown>)
    ),
  });
}
