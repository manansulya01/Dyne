import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type EventDoc, type EventAttendeeDoc } from "@/lib/mongo/collections";
import { toObjectId, objectIdSchema } from "@/lib/mongo/ids";
import { getSessionUser } from "@/lib/auth/session";
import { resolveAuthors } from "@/lib/db/authors";
import { EventDetailClient } from "./EventDetailClient";

export const metadata: Metadata = { title: "Event — Dyne" };

interface Props { params: Promise<{ id: string }>; }

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) notFound();
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);

  const event = await col<EventDoc>(db, "events").findOne({ _id: toObjectId(id) } as never);
  if (!event) notFound();

  const [going, interested, mine, attendees] = await Promise.all([
    col<EventAttendeeDoc>(db, "eventAttendees").countDocuments({ eventId: event._id, status: "going" } as never),
    col<EventAttendeeDoc>(db, "eventAttendees").countDocuments({ eventId: event._id, status: "interested" } as never),
    user ? col<EventAttendeeDoc>(db, "eventAttendees").findOne({ eventId: event._id, userId: toObjectId(user.id) } as never) : null,
    col<EventAttendeeDoc>(db, "eventAttendees").find({ eventId: event._id, status: "going" } as never).sort({ createdAt: -1 }).limit(12).toArray(),
  ]);
  const authors = await resolveAuthors(db, [event.organizerId, ...attendees.map((a) => a.userId)]);
  let location: { id: string; name: string } | null = null;
  if (event.locationId) {
    const b = await col(db, "buildings").findOne({ _id: event.locationId } as never);
    if (b) location = { id: b._id.toHexString(), name: (b as unknown as Record<string, string>).name };
  }

  const payload = {
    id: event._id.toHexString(),
    title: event.title,
    description: event.description,
    image_url: event.imageUrl,
    start_time: event.startTime.toISOString(),
    end_time: event.endTime.toISOString(),
    is_public: event.isPublic,
    max_attendees: event.maxAttendees,
    going_count: going,
    interested_count: interested,
    user_rsvp: mine?.status ?? null,
    is_organizer: !!user && event.organizerId.equals(toObjectId(user.id)),
    organizer: authors.get(event.organizerId.toHexString()) ?? null,
    location,
    attendees: attendees.map((a) => authors.get(a.userId.toHexString()) ?? { id: a.userId.toHexString() }),
  };

  return <EventDetailClient event={JSON.parse(JSON.stringify(payload))} />;
}
