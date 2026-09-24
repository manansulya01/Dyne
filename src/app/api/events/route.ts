import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type EventDoc } from "@/lib/mongo/collections";
import { eventCreateSchema } from "@/lib/validation";
import { createEvent, listEvents } from "@/lib/db/events";
import { resolveAuthors } from "@/lib/db/authors";
import { toEventJSON } from "@/lib/db/contracts";
import { parseLimitParam } from "@/lib/utils";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

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

async function withLocationName(
  db: Awaited<ReturnType<typeof getDb>>,
  event: EventDoc
) {
  if (!event.locationId) return null;
  const building = await col(db, "buildings").findOne({ _id: event.locationId } as never);
  if (!building) return null;
  return { id: building._id.toHexString(), name: building.name };
}

export async function GET(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);

  const events = await listEvents(db, user.id, limit, {
    cursor,
    isAdmin: user.role === "admin",
  });
  const buildings = await col(db, "buildings").find({}).project({ name: 1 }).toArray();
  const buildingMap = new Map(
    buildings.map((b) => [b._id.toHexString(), { id: b._id.toHexString(), name: b.name }])
  );
  // listEvents serializes locationId to a hex string already.
  const withLocation = events.map((e) => {
    const row = e as unknown as Record<string, unknown>;
    const locId = typeof row.locationId === "string" ? row.locationId : null;
    return toEventJSON({
      ...row,
      locationName: locId ? buildingMap.get(locId) ?? null : null,
    });
  });

  return NextResponse.json({
    events: withLocation,
    cursor: withLocation.length
      ? withLocation[withLocation.length - 1].start_time
      : null,
    hasMore: withLocation.length === limit,
  });
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const validated = eventCreateSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const created = await createEvent(db, user.id, user.role, {
    title: validated.data.title,
    description: validated.data.description ?? null,
    locationId: validated.data.locationId ?? null,
    startTime: new Date(validated.data.startTime),
    endTime: new Date(validated.data.endTime),
    isPublic: validated.data.isPublic ?? true,
    maxAttendees: validated.data.maxAttendees ?? null,
  });

  if (!created.ok) {
    if (created.reason === "forbidden") {
      return NextResponse.json({ error: "Not authorized to create events" }, { status: 403 });
    }
    if (created.reason === "bad_location") {
      return NextResponse.json({ error: { locationId: ["Location not found"] } }, { status: 400 });
    }
    return NextResponse.json({ error: { _form: ["Invalid event data"] } }, { status: 400 });
  }

  const row = await col<EventDoc>(db, "events").findOne({ _id: created.eventId } as never);
  if (!row) return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  const authors = await resolveAuthors(db, [row.organizerId]);
  return NextResponse.json({
    event: toEventJSON({
      ...row,
      attendeeCount: 0,
      userRsvp: null,
      isOrganizer: true,
      organizer: authors.get(row.organizerId.toHexString()) ?? null,
      locationName: await withLocationName(db, row),
    } as unknown as Record<string, unknown>),
  });
}
