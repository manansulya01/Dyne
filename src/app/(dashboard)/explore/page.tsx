import type { Metadata } from "next";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/session";
import { listBlogs, listAnnouncements } from "@/lib/db/content";
import { ExploreClient } from "./ExploreClient";

export const metadata: Metadata = { title: "Explore — Dyne", description: "Discover people, communities, posts, videos, clubs, events, and campus stories." };

export default async function ExplorePage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);

  const [communities, videos, events, clubs, buildings, blogs, announcements] = await Promise.all([
    col(db, "communities").find({ isPrivate: false } as never).sort({ createdAt: -1 }).limit(8).toArray().catch(() => []),
    col(db, "videos").find({} as never).sort({ viewCount: -1 }).limit(6).toArray().catch(() => []),
    col(db, "events").find({ isPublic: true, startTime: { $gte: new Date() } } as never).sort({ startTime: 1 }).limit(6).toArray().catch(() => []),
    col(db, "clubs").find({} as never).sort({ name: 1 }).limit(8).toArray().catch(() => []),
    col(db, "buildings").find({} as never).sort({ name: 1 }).limit(8).toArray().catch(() => []),
    listBlogs(db, { limit: 6 }).catch(() => []),
    (user ? listAnnouncements(db, { limit: 4 }).catch(() => []) : Promise.resolve([])),
  ]);

  const serialize = (rows: unknown[]) => JSON.parse(JSON.stringify(rows, (_k, v) => (v && v.$oid ? v.$oid : v)));
  void serialize;

  return (
    <ExploreClient
      communities={JSON.parse(JSON.stringify(communities))}
      videos={JSON.parse(JSON.stringify(videos))}
      events={JSON.parse(JSON.stringify(events))}
      clubs={JSON.parse(JSON.stringify(clubs))}
      buildings={JSON.parse(JSON.stringify(buildings))}
      blogs={JSON.parse(JSON.stringify(blogs))}
      announcements={JSON.parse(JSON.stringify(announcements))}
    />
  );
}
