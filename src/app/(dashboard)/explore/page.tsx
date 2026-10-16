import type { Metadata } from "next";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/session";
import { listBlogs } from "@/lib/db/content";
import { listAnnouncements } from "@/lib/db/announcements";
import { ExploreClient } from "./ExploreClient";

export const metadata: Metadata = { title: "Explore — Dyne", description: "Discover people, communities, posts, videos, clubs, events, and campus stories." };

export default async function ExplorePage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);

  const [communities, videos, events, clubs, buildings, blogs, announcements] = await Promise.all([
    col(db, "communities").find({ isPrivate: false } as never).sort({ createdAt: -1, _id: -1 }).limit(8).toArray().catch(() => []),
    col(db, "videos").find({} as never).sort({ viewCount: -1, _id: -1 }).limit(6).toArray().catch(() => []),
    col(db, "events").find({ isPublic: true, startTime: { $gte: new Date() } } as never).sort({ startTime: 1, _id: 1 }).limit(6).toArray().catch(() => []),
    col(db, "clubs").find({} as never).sort({ name: 1, _id: 1 }).limit(8).toArray().catch(() => []),
    col(db, "buildings").find({} as never).sort({ name: 1, _id: 1 }).limit(8).toArray().catch(() => []),
    listBlogs(db, { limit: 6 }).catch(() => []),
    (user
      ? listAnnouncements(db, { limit: 4, viewerRole: user.role, viewerId: user.id }).catch(() => [])
      : Promise.resolve([])),
  ]);

  // Real attendee counts (no fake zeros): single aggregation over the listed events.
  let eventsWithCounts: unknown[] = events;
  try {
    const ids = events.map((e) => (e as { _id: unknown })._id).filter(Boolean);
    if (ids.length > 0) {
      const counts = await col(db, "eventAttendees")
        .aggregate([
          { $match: { eventId: { $in: ids }, status: "going" } },
          { $group: { _id: "$eventId", n: { $sum: 1 } } },
        ])
        .toArray()
        .catch(() => []);
      const countMap = new Map(counts.map((c) => [String(c._id), c.n as number]));
      eventsWithCounts = events.map((e) => ({
        ...(e as Record<string, unknown>),
        attendeeCount: countMap.get(String((e as { _id: unknown })._id)) ?? 0,
      }));
    } else {
      eventsWithCounts = events.map((e) => ({ ...(e as Record<string, unknown>), attendeeCount: 0 }));
    }
  } catch {
    eventsWithCounts = events.map((e) => ({ ...(e as Record<string, unknown>), attendeeCount: 0 }));
  }

  const serialize = (rows: unknown[]) => JSON.parse(JSON.stringify(rows, (_k, v) => (v && v.$oid ? v.$oid : v)));
  void serialize;

  return (
    <ExploreClient
      communities={JSON.parse(JSON.stringify(communities))}
      videos={JSON.parse(JSON.stringify(videos))}
      events={JSON.parse(JSON.stringify(eventsWithCounts))}
      clubs={JSON.parse(JSON.stringify(clubs))}
      buildings={JSON.parse(JSON.stringify(buildings))}
      blogs={JSON.parse(JSON.stringify(blogs))}
      announcements={JSON.parse(JSON.stringify(announcements))}
    />
  );
}
