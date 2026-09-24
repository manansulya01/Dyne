import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type EventDoc, type EventAttendeeDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { cancelRsvp, rsvpEvent } from "@/lib/db/events";
import { resolveAuthors } from "@/lib/db/authors";
import { createNotification } from "@/lib/db/notifications";
import { parseLimitParam } from "@/lib/utils";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

interface Params {
  params: Promise<{ id: string }>;
}

const statusSchema = z.object({ status: z.enum(["going", "interested", "declined"]).default("going") });

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

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);
  const status = searchParams.get("status");
  if (status !== null && !["going", "interested", "declined"].includes(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

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

  const filter: Record<string, unknown> = { eventId: toObjectId(id) };
  if (status) filter.status = status;
  if (cursor) {
    const parsed = new Date(cursor);
    // ASC chronological order: advance forward with $gt (matches events list).
    if (!isNaN(+parsed)) filter.createdAt = { $gt: parsed };
  }

  const rows = await col<EventAttendeeDoc>(db, "eventAttendees")
    .find(filter as never)
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.userId));

  return NextResponse.json({
    attendees: rows.map((r) => ({
      ...(authors.get(r.userId.toHexString()) ?? null),
      status: r.status,
      rsvp_at: r.createdAt,
    })),
    cursor: rows.length ? rows[rows.length - 1].createdAt : null,
    hasMore: rows.length === limit,
  });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => ({}));
  const validated = statusSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const result = await rsvpEvent(db, id, user.id, validated.data.status);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (result.reason === "private") {
      return NextResponse.json({ error: "This event is private" }, { status: 403 });
    }
    return NextResponse.json({ error: "Event is full" }, { status: 400 });
  }

  const event = await col<EventDoc>(db, "events").findOne({ _id: toObjectId(id) } as never);
  if (event && !event.organizerId.equals(toObjectId(user.id))) {
    await createNotification(db, {
      recipientId: event.organizerId,
      actorId: user.id,
      type: "event_rsvp",
      title: "New RSVP",
      message: `RSVP'd ${validated.data.status} to your event`,
      data: { event_id: id, status: validated.data.status },
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await authed(id);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  await cancelRsvp(db, id, user.id);
  return NextResponse.json({ success: true });
}
