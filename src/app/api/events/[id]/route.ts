import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type EventDoc, type EventAttendeeDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { eventCreateSchema } from "@/lib/validation";
import { resolveAuthors } from "@/lib/db/authors";
import { toEventJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

interface Params {
  params: Promise<{ id: string }>;
}

async function authed(rawId: string) {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    if (!objectIdSchema.safeParse(rawId).success) {
      return { db, error: NextResponse.json({ error: "Event not found" }, { status: 404 }) };
    }
    return { db, user };
  } catch (err) {
    const { status, message } = toHttpError(err);
    return { db, error: NextResponse.json({ error: message }, { status }) };
  }
}

async function eventPayload(
  db: Awaited<ReturnType<typeof getDb>>,
  event: EventDoc,
  userId: string
) {
  const [going, mine] = await Promise.all([
    col<EventAttendeeDoc>(db, "eventAttendees").countDocuments({
      eventId: event._id,
      status: "going",
    } as never),
    col<EventAttendeeDoc>(db, "eventAttendees").findOne({
      eventId: event._id,
      userId: toObjectId(userId),
    } as never),
  ]);
  const authors = await resolveAuthors(db, [event.organizerId]);
  let locationName: unknown = null;
  if (event.locationId) {
    const building = await col(db, "buildings").findOne({ _id: event.locationId } as never);
    if (building) locationName = { id: building._id.toHexString(), name: building.name };
  }
  return toEventJSON({
    ...event,
    attendeeCount: going,
    userRsvp: mine?.status ?? null,
    isOrganizer: event.organizerId.equals(toObjectId(userId)),
    organizer: authors.get(event.organizerId.toHexString()) ?? null,
    locationName,
  } as unknown as Record<string, unknown>);
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const event = await col<EventDoc>(db, "events").findOne({ _id: toObjectId(id) } as never);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!event.isPublic && !event.organizerId.equals(toObjectId(user.id)) && user.role !== "admin") {
    const attendee = await col<EventAttendeeDoc>(db, "eventAttendees").findOne({
      eventId: event._id,
      userId: toObjectId(user.id),
    } as never);
    if (!attendee) {
      return NextResponse.json({ error: "This event is private" }, { status: 403 });
    }
  }
  return NextResponse.json({ event: await eventPayload(db, event, user.id) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const rawBody = await request.json().catch(() => null);
  // `locationId: null` clears the location; the create schema has no null
  // variant, so normalize before validation and re-apply after.
  const clearLocation =
    !!rawBody && typeof rawBody === "object" && (rawBody as Record<string, unknown>).locationId === null;
  const bodyForValidation =
    clearLocation && rawBody && typeof rawBody === "object"
      ? { ...(rawBody as Record<string, unknown>), locationId: undefined }
      : rawBody;
  // NOTE: eventCreateSchema.isPublic has a `.default(true)` which Zod applies
  // even under `.partial()` — an omitted key would parse to `true` and flip
  // private events public. Gate boolean/intent fields on raw-body key
  // presence so omitted fields are never treated as intent.
  const rawKeys =
    rawBody && typeof rawBody === "object" ? new Set(Object.keys(rawBody as Record<string, unknown>)) : new Set<string>();
  const validated = eventCreateSchema.partial().safeParse(bodyForValidation);
  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const event = await col<EventDoc>(db, "events").findOne({ _id: toObjectId(id) } as never);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!event.organizerId.equals(toObjectId(user.id)) && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (validated.data.title !== undefined) {
    if (validated.data.title.trim().length < 3 || validated.data.title.length > 200) {
      return NextResponse.json({ error: { title: ["Invalid title"] } }, { status: 400 });
    }
    patch.title = validated.data.title.trim();
  }
  if (validated.data.description !== undefined) patch.description = validated.data.description;
  if (validated.data.locationId !== undefined || clearLocation) {
    if (clearLocation || !validated.data.locationId) {
      patch.locationId = null;
    } else {
      let locationId;
      try {
        locationId = toObjectId(validated.data.locationId);
      } catch {
        return NextResponse.json({ error: { locationId: ["Location not found"] } }, { status: 400 });
      }
      const building = await col(db, "buildings").findOne({ _id: locationId } as never);
      if (!building) {
        return NextResponse.json({ error: { locationId: ["Location not found"] } }, { status: 400 });
      }
      patch.locationId = locationId;
    }
  }
  if (validated.data.startTime !== undefined) {
    const start = new Date(validated.data.startTime);
    if (isNaN(+start)) {
      return NextResponse.json({ error: { startTime: ["Invalid start time"] } }, { status: 400 });
    }
    patch.startTime = start;
  }
  if (validated.data.endTime !== undefined) {
    const end = new Date(validated.data.endTime);
    if (isNaN(+end)) {
      return NextResponse.json({ error: { endTime: ["Invalid end time"] } }, { status: 400 });
    }
    patch.endTime = end;
  }
  // Re-validate the resulting window after the patch (prevents date inversion).
  const finalStart = (patch.startTime ?? event.startTime) as Date;
  const finalEnd = (patch.endTime ?? event.endTime) as Date;
  if (finalEnd <= finalStart) {
    return NextResponse.json({ error: { endTime: ["End time must be after start time"] } }, { status: 400 });
  }
  // isPublic: only when the client sent the key (see default() note above).
  if (rawKeys.has("isPublic") && validated.data.isPublic !== undefined) {
    patch.isPublic = validated.data.isPublic;
  }
  if (rawKeys.has("maxAttendees") && validated.data.maxAttendees !== undefined) {
    const going = await col<EventAttendeeDoc>(db, "eventAttendees").countDocuments({
      eventId: event._id,
      status: "going",
    } as never);
    if (validated.data.maxAttendees !== null && validated.data.maxAttendees < going) {
      return NextResponse.json(
        { error: { maxAttendees: [`Cannot go below ${going} confirmed attendees`] } },
        { status: 400 }
      );
    }
    patch.maxAttendees = validated.data.maxAttendees;
  }

  await col<EventDoc>(db, "events").updateOne({ _id: event._id } as never, { $set: patch });
  const updated = await col<EventDoc>(db, "events").findOne({ _id: event._id } as never);
  if (!updated) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json({ event: await eventPayload(db, updated, user.id) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const event = await col<EventDoc>(db, "events").findOne({ _id: toObjectId(id) } as never);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!event.organizerId.equals(toObjectId(user.id)) && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await Promise.all([
    col<EventDoc>(db, "events").deleteOne({ _id: event._id } as never),
    col<EventAttendeeDoc>(db, "eventAttendees").deleteMany({ eventId: event._id } as never),
  ]);
  return NextResponse.json({ success: true });
}
