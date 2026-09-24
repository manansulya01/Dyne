import { Db, ObjectId } from "mongodb";
import { col, type CollectionName } from "@/lib/mongo/collections";
import { serializeMany } from "./serialize";

type Hit = { _id: ObjectId; deletedAt?: Date | null } & Record<string, unknown>;

export interface SearchResults {
  people: unknown[];
  posts: unknown[];
  communities: unknown[];
  events: unknown[];
  buildings: unknown[];
  clubs: unknown[];
  videos: unknown[];
  blogs: unknown[];
}

const empty: SearchResults = {
  people: [],
  posts: [],
  communities: [],
  events: [],
  buildings: [],
  clubs: [],
  videos: [],
  blogs: [],
};

/**
 * Cross-entity search using MongoDB $text indexes (one per collection).
 * Never downloads tables; every branch is server-side with a hard limit.
 *
 * Private communities/events are filtered to what the searcher may see:
 * members/owners (+admins) for private communities, organizers/attendees
 * (+admins) for private events.
 */
export async function globalSearch(
  db: Db,
  rawQuery: string,
  opts?: { userId?: string | ObjectId; isAdmin?: boolean }
): Promise<SearchResults> {
  const q = rawQuery.trim().slice(0, 100);
  if (q.length < 2) return { ...empty };

  const text = { $text: { $search: q } };

  async function top(
    name: CollectionName,
    project?: Record<string, 0 | 1>,
    extraFilter?: Record<string, unknown>
  ): Promise<Hit[]> {
    // People results must never include secrets: the users branch is always
    // projected to public fields below.
    const safeProject =
      name === "users"
        ? { username: 1, displayName: 1, avatarUrl: 1, role: 1 }
        : (project ?? {});
    const rows = await col(db, name)
      .find({ ...text, ...extraFilter } as never, { projection: { ...safeProject, score: { $meta: "textScore" } } } as never)
      .sort({ score: { $meta: "textScore" } } as never)
      .limit(6)
      .toArray();
    return rows as unknown as Hit[];
  }

  // Visibility filters for private entities (admins see everything).
  let communityFilter: Record<string, unknown> | undefined;
  let eventFilter: Record<string, unknown> | undefined;
  if (!opts?.isAdmin && opts?.userId) {
    const uid = opts.userId instanceof ObjectId ? opts.userId : new ObjectId(opts.userId);
    const [memberships, attendances] = await Promise.all([
      col(db, "communityMembers").find({ userId: uid } as never).project({ communityId: 1 }).toArray(),
      col(db, "eventAttendees").find({ userId: uid } as never).project({ eventId: 1 }).toArray(),
    ]);
    communityFilter = {
      $or: [
        { isPrivate: false },
        { _id: { $in: memberships.map((m) => m.communityId) } },
        { ownerId: uid },
      ],
    };
    eventFilter = {
      $or: [
        { isPublic: true },
        { _id: { $in: attendances.map((a) => a.eventId) } },
        { organizerId: uid },
      ],
    };
  } else if (!opts?.isAdmin) {
    communityFilter = { isPrivate: false };
    eventFilter = { isPublic: true };
  }

  const [people, posts, communities, events, buildings, clubs, videos, blogs] = await Promise.all([
    top("users", { username: 1, displayName: 1, avatarUrl: 1, role: 1 }),
    top("posts"),
    top("communities", undefined, communityFilter),
    top("events", undefined, eventFilter),
    top("buildings"),
    top("clubs"),
    top("videos"),
    top("blogs", { title: 1, slug: 1, excerpt: 1, coverImageUrl: 1, category: 1, publishedAt: 1 }, { isPublished: true }),
  ]);

  // People search should also match usernames by prefix (text search ranks
  // full words; prefix covers handle typing). Merged server-side, deduped.
  const prefixHits = (await col(db, "users")
    .find({ username: { $regex: `^${escapeRegExp(q)}`, $options: "i" } } as never)
    .project({ username: 1, displayName: 1, avatarUrl: 1, role: 1 })
    .limit(6)
    .toArray()) as unknown as Hit[];
  const seen = new Set(people.map((p) => String(p._id)));
  for (const hit of prefixHits) {
    if (!seen.has(String(hit._id))) {
      seen.add(String(hit._id));
      people.push(hit);
    }
  }

  return {
    people: serializeMany(people.slice(0, 8)),
    posts: serializeMany(posts.filter((p) => !p.deletedAt).slice(0, 6)),
    communities: serializeMany(communities),
    events: serializeMany(events),
    buildings: serializeMany(buildings),
    clubs: serializeMany(clubs),
    videos: serializeMany(videos),
    blogs: serializeMany(blogs),
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
