import { Db, ObjectId } from "mongodb";
import { col, type CollectionName } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { resolveAuthors } from "./authors";
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
  reels: unknown[];
  blogs: unknown[];
  studyMaterials: unknown[];
  announcements: unknown[];
}

const empty: SearchResults = {
  people: [],
  posts: [],
  communities: [],
  events: [],
  buildings: [],
  clubs: [],
  videos: [],
  reels: [],
  blogs: [],
  studyMaterials: [],
  announcements: [],
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
    const uid = opts.userId instanceof ObjectId ? opts.userId : toObjectId(opts.userId);
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

  // Private teacher/admin artefacts (draft assignments, draft exams, held
  // content) are NEVER searchable — only published/approved rows are included.
  const approvedContent = { $or: [{ moderationStatus: "approved" }, { moderationStatus: { $exists: false } }] };
  const now = new Date();

  const [
    people, posts, communities, events, buildings, clubs, videos, reels, blogs, studyMaterials, announcements,
  ] = await Promise.all([
    top("users", { username: 1, displayName: 1, avatarUrl: 1, role: 1 }),
    top("posts"),
    top("communities", undefined, communityFilter),
    top("events", undefined, eventFilter),
    top("buildings"),
    top("clubs"),
    top("videos", { title: 1, category: 1, thumbnailUrl: 1, createdAt: 1 }, approvedContent),
    top("reels", { title: 1, category: 1, thumbnailUrl: 1, createdAt: 1 }, { moderationStatus: "approved" }),
    top("blogs", { title: 1, slug: 1, excerpt: 1, coverImageUrl: 1, category: 1, publishedAt: 1 }, {
      isPublished: true,
      $or: [{ moderationStatus: "approved" }, { moderationStatus: { $exists: false } }],
    }),
    col(db, "studyMaterials")
      .find({ title: { $regex: escapeRegExp(q), $options: "i" }, isRemoved: { $ne: true }, status: "approved" } as never)
      .project({ title: 1, subject: 1, classGrade: 1, materialType: 1 })
      .limit(6)
      .toArray() as unknown as Promise<Hit[]>,
    col(db, "announcements")
      .find({
        title: { $regex: escapeRegExp(q), $options: "i" },
        $and: [
          { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
          { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
        ],
      } as never)
      .project({ title: 1, body: 1, category: 1, priority: 1, isPinned: 1, createdAt: 1 })
      .sort({ isPinned: -1, createdAt: -1 })
      .limit(6)
      .toArray() as unknown as Promise<Hit[]>,
  ]);

  // Post hits arrive without authors (the projection is minimal), so the UI
  // previously rendered every search result as "Unknown". Resolve them here.
  if (posts.length > 0) {
    const authors = await resolveAuthors(
      db,
      posts.map((p) => p.authorId).filter((v): v is ObjectId => v instanceof ObjectId)
    );
    for (const p of posts) {
      const uid = p.authorId ? String(p.authorId) : null;
      p.author = uid ? authors.get(uid) ?? null : null;
    }
  }

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
    reels: serializeMany(reels),
    blogs: serializeMany(blogs),
    studyMaterials: serializeMany(studyMaterials),
    announcements: serializeMany(announcements),
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
