import { Db, Collection, Document, ObjectId } from "mongodb";

/**
 * MongoDB domain documents for Dyne. One coherent model:
 * - `_id: ObjectId` primary keys everywhere (serialized to hex `id` at the API boundary)
 * - `users` merges authentication + profile (no separate auth.users/profiles split)
 * - soft delete via `deletedAt` where the product needs recoverable moderation
 * - cross-entity references stored as ObjectId (never DBRefs)
 */

export type UserRole = "student" | "teacher" | "staff" | "club" | "admin";
export type CommunityMemberRole = "owner" | "moderator" | "member";
export type ReactionTargetType = "post" | "comment" | "video";
export type RsvpStatus = "going" | "interested" | "declined";
export type NotificationType =
  | "follow" | "like" | "comment" | "mention" | "community_join"
  | "message" | "event_reminder" | "moderation_action" | "event_rsvp";
export type ReportTargetType = "post" | "comment" | "user" | "community" | "video";
export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";

export interface UserDoc extends Document {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  accent: string | null;
  bio: string | null;
  role: UserRole;
  classGrade: string | null;
  house: string | null;
  interests: string[];
  emailVerifiedAt: Date | null;
  /** Account suspension (temp_ban/perm_ban). While in the future, login and sessions are refused. */
  suspendedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface PasswordResetDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface MediaItem {
  url: string;
  mediaType: "image" | "video";
  thumbnailUrl: string | null;
  orderIndex: number;
}

/**
 * Staged uploads: files uploaded before their post exists. Referenced by id
 * from the create-post call, embedded into the post, then deleted. TTL
 * removes orphans left by abandoned composers.
 */
export interface PendingMediaDoc extends Document {
  _id: ObjectId;
  uploaderId: ObjectId;
  bucket: string;
  key: string;
  url: string;
  mediaType: "image" | "video";
  thumbnailUrl: string | null;
  createdAt: Date;
}

export interface PostDoc extends Document {
  _id: ObjectId;
  authorId: ObjectId;
  content: string | null;
  media: MediaItem[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CommentDoc extends Document {
  _id: ObjectId;
  postId: ObjectId;
  authorId: ObjectId;
  content: string;
  parentId: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ReactionDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  targetType: ReactionTargetType;
  targetId: ObjectId;
  kind: string;
  createdAt: Date;
}

export interface SavedPostDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  postId: ObjectId;
  createdAt: Date;
}

export interface FollowDoc extends Document {
  _id: ObjectId;
  followerId: ObjectId;
  followingId: ObjectId;
  createdAt: Date;
}

export interface CommunityDoc extends Document {
  _id: ObjectId;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  ownerId: ObjectId;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityMemberDoc extends Document {
  _id: ObjectId;
  communityId: ObjectId;
  userId: ObjectId;
  role: CommunityMemberRole;
  joinedAt: Date;
}

export interface CommunityPostDoc extends Document {
  _id: ObjectId;
  communityId: ObjectId;
  authorId: ObjectId;
  content: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ConversationDoc extends Document {
  _id: ObjectId;
  type: "direct" | "group";
  name: string | null;
  imageUrl: string | null;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMemberDoc extends Document {
  _id: ObjectId;
  conversationId: ObjectId;
  userId: ObjectId;
  /** "admin" for the creator (and promoted members), "member" otherwise. */
  role: "admin" | "member";
  lastReadAt: Date | null;
  joinedAt: Date;
}

export interface MessageAttachment {
  url: string;
  mime: string;
  fileName: string;
  size: number;
}

export interface MessageDoc extends Document {
  _id: ObjectId;
  conversationId: ObjectId;
  senderId: ObjectId;
  content: string | null;
  attachments: MessageAttachment[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface EventDoc extends Document {
  _id: ObjectId;
  title: string;
  description: string | null;
  imageUrl: string | null;
  locationId: ObjectId | null;
  startTime: Date;
  endTime: Date;
  organizerId: ObjectId;
  isPublic: boolean;
  maxAttendees: number | null;
  /** Denormalized count of "going" RSVPs; claimed/released atomically. */
  goingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventAttendeeDoc extends Document {
  _id: ObjectId;
  eventId: ObjectId;
  userId: ObjectId;
  status: RsvpStatus;
  createdAt: Date;
}

export interface BuildingDoc extends Document {
  _id: ObjectId;
  name: string;
  description: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  floorCount: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClubDoc extends Document {
  _id: ObjectId;
  name: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  isOfficial: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoDoc extends Document {
  _id: ObjectId;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  creatorId: ObjectId;
  duration: number | null;
  viewCount: number;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoViewDoc extends Document {
  _id: ObjectId;
  videoId: ObjectId;
  userId: ObjectId;
  watchedDuration: number;
  createdAt: Date;
}

export interface NotificationDoc extends Document {
  _id: ObjectId;
  recipientId: ObjectId;
  actorId: ObjectId | null;
  type: NotificationType;
  title: string;
  message: string | null;
  data: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface ReportDoc extends Document {
  _id: ObjectId;
  reporterId: ObjectId;
  targetType: ReportTargetType;
  targetId: ObjectId;
  reason: string;
  description: string | null;
  status: ReportStatus;
  reviewedBy: ObjectId | null;
  reviewedAt: Date | null;
  moderatorNotes: string | null;
  createdAt: Date;
}

export interface ModerationActionDoc extends Document {
  _id: ObjectId;
  moderatorId: ObjectId;
  targetType: ReportTargetType;
  targetId: ObjectId;
  action: "warning" | "content_removal" | "temp_ban" | "perm_ban" | "dismiss";
  reason: string | null;
  moderatorNotes: string | null;
  createdAt: Date;
}

export interface BlogDoc extends Document {
  _id: ObjectId;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  category: string | null;
  authorId: ObjectId;
  isPublished: boolean;
  isFeatured: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnnouncementDoc extends Document {
  _id: ObjectId;
  title: string;
  body: string;
  category: string | null;
  audience: "all" | "students" | "staff";
  isPinned: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimetableEntryDoc extends Document {
  _id: ObjectId;
  dayOfWeek: number; // 0=Sunday..6=Saturday
  periodIndex: number;
  startTime: string; // "09:00"
  endTime: string; // "09:50"
  subject: string;
  room: string | null;
  teacher: string | null;
  classGrade: string | null;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface PollDoc extends Document {
  _id: ObjectId;
  communityId: ObjectId;
  authorId: ObjectId;
  question: string;
  options: string[];
  closesAt: Date | null;
  createdAt: Date;
}

export interface PollVoteDoc extends Document {
  _id: ObjectId;
  pollId: ObjectId;
  userId: ObjectId;
  optionIndex: number;
  createdAt: Date;
}

export const collectionNames = [
  "users",
  "sessions",
  "passwordResets",
  "posts",
  "pendingMedia",
  "comments",
  "reactions",
  "savedPosts",
  "follows",
  "communities",
  "communityMembers",
  "communityPosts",
  "chatConversations",
  "chatMembers",
  "chatMessages",
  "events",
  "eventAttendees",
  "buildings",
  "clubs",
  "videos",
  "videoViews",
  "notifications",
  "reports",
  "moderationActions",
  "blogs",
  "announcements",
  "timetableEntries",
  "polls",
  "pollVotes",
  "settings",
] as const;

export type CollectionName = (typeof collectionNames)[number];

export function col<T extends Document>(db: Db, name: CollectionName): Collection<T> {
  return db.collection<T>(name);
}

/**
 * Create collections (implicit on first write, but explicit here for clarity)
 * and all indexes. Idempotent — safe to run on every boot and in tests.
 *
 * Index creation is skipped when this process already ensured the same
 * database (one ~50-op round-trip per boot instead of per request).
 * Failures are never cached, so the next request retries.
 */
const ensuredDatabases = new Set<string>();

export async function ensureIndexes(db: Db): Promise<void> {
  const key = db.databaseName;
  if (ensuredDatabases.has(key)) return;
  await createAllIndexes(db);
  ensuredDatabases.add(key);
}

/** Test helper: forget ensured state (used when databases are dropped between tests). */
export function __resetEnsuredDatabasesForTests(): void {
  ensuredDatabases.clear();
}

async function createAllIndexes(db: Db): Promise<void> {
  const jobs: Array<Promise<string>> = [];
  const idx = (
    name: CollectionName,
    keys: Record<string, 1 | -1>,
    options?: { unique?: boolean; expireAfterSeconds?: number; name?: string }
  ) => {
    jobs.push(db.collection(name).createIndex(keys, options ?? {}));
  };

  idx("users", { email: 1 }, { unique: true });
  idx("users", { username: 1 }, { unique: true });
  idx("users", { role: 1 });
  idx("users", { createdAt: -1 });

  idx("sessions", { tokenHash: 1 }, { unique: true });
  idx("sessions", { userId: 1 });
  idx("sessions", { expiresAt: 1 }, { expireAfterSeconds: 0 });

  idx("passwordResets", { tokenHash: 1 }, { unique: true });
  idx("passwordResets", { userId: 1 });
  idx("passwordResets", { expiresAt: 1 }, { expireAfterSeconds: 0 });

  idx("posts", { authorId: 1, createdAt: -1 });
  idx("posts", { createdAt: -1 });
  idx("posts", { deletedAt: 1 });

  idx("pendingMedia", { uploaderId: 1 });
  idx("pendingMedia", { createdAt: 1 }, { expireAfterSeconds: 24 * 3600 });

  idx("comments", { postId: 1, createdAt: 1 });
  idx("comments", { authorId: 1 });
  idx("comments", { parentId: 1 });

  idx("reactions", { targetType: 1, targetId: 1 });
  idx("reactions", { userId: 1, targetType: 1, targetId: 1, kind: 1 }, { unique: true });

  idx("savedPosts", { userId: 1, createdAt: -1 });
  idx("savedPosts", { userId: 1, postId: 1 }, { unique: true });

  idx("follows", { followerId: 1, followingId: 1 }, { unique: true });
  idx("follows", { followingId: 1 });
  idx("follows", { followerId: 1 });

  idx("communities", { slug: 1 }, { unique: true });
  idx("communities", { ownerId: 1 });
  idx("communities", { createdAt: -1 });

  idx("communityMembers", { communityId: 1, userId: 1 }, { unique: true });
  idx("communityMembers", { userId: 1 });

  idx("communityPosts", { communityId: 1, createdAt: -1 });
  idx("communityPosts", { authorId: 1 });

  idx("chatConversations", { updatedAt: -1 });
  idx("chatConversations", { createdBy: 1 });

  idx("chatMembers", { conversationId: 1, userId: 1 }, { unique: true });
  idx("chatMembers", { userId: 1 });

  idx("chatMessages", { conversationId: 1, createdAt: 1 });
  idx("chatMessages", { senderId: 1 });

  idx("events", { startTime: 1 });
  idx("events", { organizerId: 1 });

  idx("eventAttendees", { eventId: 1, userId: 1 }, { unique: true });
  idx("eventAttendees", { eventId: 1, status: 1 });

  idx("buildings", { name: 1 });
  idx("clubs", { name: 1 });
  idx("clubs", { category: 1 });

  idx("videos", { creatorId: 1, createdAt: -1 });
  idx("videos", { createdAt: -1 });
  idx("videos", { viewCount: -1 });
  idx("videos", { category: 1 });

  idx("videoViews", { videoId: 1, userId: 1, createdAt: -1 });

  idx("notifications", { recipientId: 1, createdAt: -1 });
  idx("notifications", { recipientId: 1, readAt: 1 });

  idx("reports", { status: 1, createdAt: -1 });
  idx("reports", { reporterId: 1 });
  idx("reports", { targetType: 1, targetId: 1 });

  idx("moderationActions", { targetType: 1, targetId: 1 });
  idx("moderationActions", { moderatorId: 1 });

  idx("blogs", { slug: 1 }, { unique: true });
  idx("blogs", { isPublished: 1, publishedAt: -1 });
  idx("blogs", { category: 1 });
  idx("blogs", { authorId: 1 });

  idx("announcements", { createdAt: -1 });
  idx("announcements", { isPinned: -1 });

  idx("timetableEntries", { dayOfWeek: 1, periodIndex: 1 });
  idx("timetableEntries", { classGrade: 1 });

  idx("polls", { communityId: 1, createdAt: -1 });
  idx("pollVotes", { pollId: 1, userId: 1 }, { unique: true });

  idx("settings", { key: 1 }, { unique: true });

  // Full-text search indexes (one per collection is the MongoDB limit).
  jobs.push(db.collection("posts").createIndex({ content: "text" }));
  jobs.push(db.collection("communities").createIndex({ name: "text", description: "text" }));
  jobs.push(db.collection("events").createIndex({ title: "text", description: "text" }));
  jobs.push(db.collection("videos").createIndex({ title: "text", description: "text" }));
  jobs.push(db.collection("users").createIndex({ username: "text", displayName: "text" }));
  jobs.push(db.collection("clubs").createIndex({ name: "text", description: "text" }));
  jobs.push(db.collection("buildings").createIndex({ name: "text", description: "text" }));
  jobs.push(db.collection("blogs").createIndex({ title: "text", excerpt: "text", content: "text" }));
  jobs.push(db.collection("announcements").createIndex({ title: "text", body: "text" }));

  await Promise.all(jobs);
}
