import { Db, Collection, Document, ObjectId } from "mongodb";

/**
 * MongoDB domain documents for Dyne. One coherent model:
 * - `_id: ObjectId` primary keys everywhere (serialized to hex `id` at the API boundary)
 * - `users` merges authentication + profile (no separate auth.users/profiles split)
 * - soft delete via `deletedAt` where the product needs recoverable moderation
 * - cross-entity references stored as ObjectId (never DBRefs)
 */

export type UserRole = "student" | "teacher" | "staff" | "club" | "moderator" | "admin" | "super_admin";
export type CommunityMemberRole = "owner" | "admin" | "moderator" | "member";
export type ReactionTargetType = "post" | "comment" | "video" | "reel";
export type RsvpStatus = "going" | "interested" | "declined";
export type NotificationType =
  | "follow" | "like" | "comment" | "mention" | "community_join"
  | "message" | "event_reminder" | "moderation_action" | "event_rsvp"
  | "assignment_published" | "assignment_due" | "assignment_overdue"
  | "exam_published" | "exam_result_released"
  | "announcement" | "content_published" | "content_moderation";
export type ReportTargetType =
  | "post"
  | "comment"
  | "user"
  | "community"
  | "video"
  | "reel"
  | "story"
  | "blog"
  | "study_material"
  | "message";
/**
 * Canonical moderation statuses (new) with legacy aliases (old).
 * Legacy: pending -> OPEN, reviewing -> UNDER_REVIEW,
 *         resolved -> ACTION_TAKEN, dismissed -> DISMISSED.
 * New statuses OPEN/UNDER_REVIEW/ACTION_TAKEN/DISMISSED/ESCALATED are stored
 * uppercase; legacy lowercase values are still accepted on read.
 */
export type ReportStatus =
  | "pending"
  | "reviewing"
  | "resolved"
  | "dismissed"
  | "OPEN"
  | "UNDER_REVIEW"
  | "ACTION_TAKEN"
  | "DISMISSED"
  | "ESCALATED";

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
  /** Discord-like profile tags from a controlled allow-list. */
  profileTags: string[];
  emailVerifiedAt: Date | null;
  /** Account suspension (temp_ban/perm_ban). While in the future, login and sessions are refused. */
  suspendedUntil: Date | null;
  /** Permanent ban flag (separate from timed suspension). */
  bannedAt: Date | null;
  banReason: string | null;
  /**
   * True when the account must rotate its password before normal use
   * (set for environment-provisioned admins). Never stores a plaintext value.
   */
  mustChangePassword?: boolean;
  /** Last password change (audit/rotation helper). */
  passwordUpdatedAt?: Date;
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
  /** "file" covers attached documents/plain text (not renderable inline). */
  mediaType: "image" | "video" | "file";
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
  /** "file" covers documents/plain text staged for chat or study materials. */
  mediaType: "image" | "video" | "file";
  thumbnailUrl: string | null;
  /** Stored since the chat-attachment claim flow; older rows fall back. */
  mime?: string;
  originalName?: string;
  size?: number;
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
  post_type: string;
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

export interface SavedReelDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  reelId: ObjectId;
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
  /** Ordered community rules shown on the community page. */
  rules: string[];
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
  /** Pinned discussions stay on top (moderator/owner controlled). */
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Named channel inside a community (Community → channels → conversations). */
export interface CommunityChannelDoc extends Document {
  _id: ObjectId;
  communityId: ObjectId;
  name: string;
  topic: string | null;
  position: number;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationDoc extends Document {
  _id: ObjectId;
  /** Only "group" may be created via the API. "direct" is legacy/disabled. */
  type: "direct" | "group";
  name: string | null;
  imageUrl: string | null;
  createdBy: ObjectId;
  /** Optional community linkage: group chats scoped to a community. */
  communityId: ObjectId | null;
  /** Optional channel within the community (requires communityId of same community). */
  channelId: ObjectId | null;
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
  editedAt: Date | null;
  /** Message reactions: { emoji: [userId, ...] } denormalized for reads. */
  reactions: Record<string, string[]>;
  /** Mentioned user ids (resolved server-side from @username tokens). */
  mentions: ObjectId[];
  /**
   * AI/rule moderation verdict for group messages.
   *
   * Group chats (community/class/club/event) are moderated; direct messages
   * are disabled product-wide, so only group content reaches this field.
   * Only the verdict metadata is stored — never a copy of the message body.
   */
  moderationStatus?: "approved" | "pending" | "flagged" | "rejected";
  moderationReason?: string | null;
  moderationScore?: number | null;
}

export type FeedbackCategory =
  | "bug"
  | "feature"
  | "ui"
  | "content"
  | "safety"
  | "other";
export type FeedbackStatus =
  | "NEW"
  | "REVIEWING"
  | "PLANNED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED";
export type FeedbackPriority = "low" | "medium" | "high" | "urgent";

export interface FeedbackDoc extends Document {
  _id: ObjectId;
  reporterId: ObjectId;
  title: string;
  description: string;
  category: FeedbackCategory;
  page: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  adminResponse: string | null;
  internalNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type StudyMaterialType =
  | "notes"
  | "worksheet"
  | "assignment"
  | "question_paper"
  | "revision"
  | "reference"
  | "presentation"
  | "other";

export interface StudyMaterialDoc extends Document {
  _id: ObjectId;
  title: string;
  description: string | null;
  subject: string;
  classGrade: string;
  topic: string | null;
  materialType: StudyMaterialType;
  tags: string[];
  teacher: string | null;
  semester: string | null;
  academicYear: string | null;
  uploaderId: ObjectId;
  bucket: string;
  key: string;
  url: string;
  mime: string;
  size: number;
  fileName: string;
  isRemoved: boolean;
  isFeatured: boolean;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

export interface SavedStudyMaterialDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  materialId: ObjectId;
  createdAt: Date;
}

export interface AuditLogDoc extends Document {
  _id: ObjectId;
  actorId: ObjectId | null;
  action: string;
  targetType: string | null;
  targetId: ObjectId | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
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

/**
 * Horizontal / landscape long-form video (Dyne Videos).
 *
 * Extends the original Watch model with orientation + moderation metadata.
 * `orientation: "vertical"` rows are legacy pre-Reels uploads and remain
 * readable; new uploads must declare their orientation explicitly.
 */
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
  /** Explicit media orientation. Reels use a separate collection. */
  orientation: "horizontal" | "vertical";
  aspectRatio: string | null;
  moderationStatus: "approved" | "pending" | "flagged" | "rejected";
  moderationReason: string | null;
  moderationScore: number | null;
  moderationSource: string | null;
  moderationProvider: string | null;
  moderationMediaAnalyzed: boolean;
  moderatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Vertical short-form video (Reels).
 *
 * Separate collection and separate UX from horizontal videos: reels are 9:16,
 * short, and swiped. Sharing media infrastructure is fine; sharing the
 * collection would blur the two experiences.
 */
export interface ReelDoc extends Document {
  _id: ObjectId;
  title: string;
  caption: string | null;
  /** Staged-upload URL of the vertical video. */
  videoUrl: string;
  thumbnailUrl: string | null;
  creatorId: ObjectId;
  durationSeconds: number | null;
  viewCount: number;
  likeCount: number;
  saveCount: number;
  shareCount: number;
  commentCount: number;
  category: string | null;
  hashtags: string[];
  /** Vertical 9:16 is expected; stored for UI hints only. */
  aspectRatio: string | null;
  width: number | null;
  height: number | null;
  moderationStatus: "approved" | "pending" | "flagged" | "rejected";
  moderationReason: string | null;
  moderationScore: number | null;
  moderationSource: string | null;
  moderationProvider: string | null;
  moderationMediaAnalyzed: boolean;
  moderatedAt: Date;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReelViewDoc extends Document {
  _id: ObjectId;
  reelId: ObjectId;
  userId: ObjectId;
  watchedSeconds: number;
  /**
   * UTC hour bucket (`Math.floor(epochMs / 3600000)`). Together with the unique
   * (reelId, userId, hourBucket) index this makes the once-per-hour view
   * throttle race-safe: concurrent duplicate requests collide on the key
   * instead of both incrementing.
   */
  hourBucket: number;
  createdAt: Date;
}

/** Ephemeral story (image/video/text) with an automatic expiry. */
export interface StoryDoc extends Document {
  _id: ObjectId;
  authorId: ObjectId;
  /** "image" | "video" | "text" */
  mediaType: "image" | "video" | "text";
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  text: string | null;
  background: string | null;
  caption: string | null;
  /** Hard expiry: stories never become permanent content. */
  expiresAt: Date;
  viewCount: number;
  moderationStatus: "approved" | "pending" | "flagged" | "rejected";
  moderationReason: string | null;
  moderationScore: number | null;
  moderationSource: string | null;
  moderationProvider: string | null;
  moderationMediaAnalyzed: boolean;
  moderatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoryViewDoc extends Document {
  _id: ObjectId;
  storyId: ObjectId;
  userId: ObjectId;
  createdAt: Date;
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

/**
 * AI/rule moderation verdict for one piece of content.
 *
 * One collection backs the unified moderation centre across blogs, group
 * messages, videos, reels, stories, posts and announcements. Private message
 * content is NEVER stored here — only a short excerpt for authorised
 * moderators plus the verdict metadata.
 */
export interface ModerationReviewDoc extends Document {
  _id: ObjectId;
  contentType: "blog" | "post" | "message" | "video" | "reel" | "story" | "announcement";
  contentId: ObjectId;
  authorId: ObjectId | null;
  /** Set for message reviews (group scope); used for authorization. */
  conversationId: ObjectId | null;
  status: "approved" | "pending" | "flagged" | "rejected";
  reason: string | null;
  /** 0..1 confidence from rules and/or provider. */
  score: number | null;
  source: "rules" | "provider" | "rules+provider" | "none" | "manual";
  /** Provider identifier (never a key). Null when no provider ran. */
  provider: string | null;
  categories: string[];
  categoriesChecked: string[];
  /** False when media bytes were NOT actually inspected by a provider. */
  mediaAnalyzed: boolean;
  needsManualReview: boolean;
  /** Short excerpt for the moderation queue (never full private content). */
  excerpt: string | null;
  reviewedBy: ObjectId | null;
  reviewedAt: Date | null;
  overrideReason: string | null;
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
  /** AI/rule verdict. Rows written before moderation existed read as approved. */
  moderationStatus?: "approved" | "pending" | "flagged" | "rejected";
  moderationReason?: string | null;
  moderationScore?: number | null;
  moderationSource?: string | null;
  moderationProvider?: string | null;
  moderationMediaAnalyzed?: boolean;
  moderatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Campus announcement.
 *
 * `audience` narrows delivery; `audienceIds` targets specific students/teachers
 * where the author is authorized. Notifications are generated once at publish
 * time (deduped by `notificationKey`) so retries never spam.
 */
export interface AnnouncementDoc extends Document {
  _id: ObjectId;
  title: string;
  body: string;
  category: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  audience: "all" | "students" | "teachers" | "staff" | "selected";
  /** Explicit recipient ids (only honoured for audience "selected"). */
  audienceIds: ObjectId[];
  /** Restrict to a class/grade (e.g. "Grade 9"). */
  audienceClassGrade: string | null;
  /** Restrict to a community. */
  audienceCommunityId: ObjectId | null;
  isPinned: boolean;
  /** Optional attachment reference (app-served URL only). */
  attachmentUrl: string | null;
  attachmentName: string | null;
  /** Optional safe external link (http/https only). */
  linkUrl: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  /** Idempotency key for notification fan-out. */
  notificationKey: string | null;
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

/* ------------------------------------------------------------------ */
/* Teacher-authored academic domain.                                   */
/*                                                                     */
/* Distinct from the student-owned productivity collections below:      */
/* `assignments` there is a personal tracker (userId-scoped). These are  */
/* class-level artefacts created by a teacher and answered by students.   */
/* ------------------------------------------------------------------ */

/** Question types supported by the exam builder (one flexible schema). */
export type ExamQuestionType =
  | "mcq"
  | "multiple_select"
  | "true_false"
  | "short_answer"
  | "long_answer"
  | "fill_blank"
  | "matching"
  | "assertion_reason"
  | "case_based"
  | "numerical"
  | "descriptive"
  | "essay"
  | "file_upload";

export interface ExamQuestionOption {
  id: string;
  text: string;
  isCorrect?: boolean;
}

export interface ExamQuestionMatchPair {
  id: string;
  left: string;
  right: string;
}

/**
 * One flexible question shape covers every question type: options for
 * choice types, pairs for matching, correct answers for auto-gradable types.
 */
export interface ExamQuestion {
  id: string;
  type: ExamQuestionType;
  prompt: string;
  marks: number;
  difficulty: "easy" | "medium" | "hard";
  options: ExamQuestionOption[];
  /** Matching pairs (type "matching"). */
  pairs: ExamQuestionMatchPair[];
  /** Accepted answers for auto-graded types. */
  correctAnswers: string[];
  /** Accepted numeric range for "numerical" (min/max). */
  numericRange: { min: number; max: number } | null;
  explanation: string | null;
  attachmentUrl: string | null;
  /** True when the platform can grade this type deterministically. */
  autoGradable: boolean;
  /** Case-study context shared by a group of "case_based" questions. */
  caseStudyText: string | null;
}

export type ExamMode = "practice" | "timed" | "question_paper" | "assessment";
export type ClassExamStatus = "draft" | "published" | "closed" | "archived";

export interface ClassExamDoc extends Document {
  _id: ObjectId;
  title: string;
  description: string | null;
  subject: string;
  /** Free-text class/grade identifier (matches users.classGrade). */
  classGrade: string;
  courseId: ObjectId | null;
  mode: ExamMode;
  status: ClassExamStatus;
  instructions: string | null;
  /** Duration in minutes (timed mode). */
  durationMinutes: number | null;
  startsAt: Date;
  endsAt: Date | null;
  totalMarks: number;
  passingMarks: number;
  attemptLimit: number;
  questions: ExamQuestion[];
  /** Teacher who owns this exam (admins may own exams too). */
  createdBy: ObjectId;
  /** True when results are visible to students. */
  resultsReleased: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExamAnswer {
  questionId: string;
  /** Selected option ids (choice types). */
  optionIds: string[];
  /** Free text (short/long/essay/descriptive/case-based). */
  text: string;
  /** Matching pairs chosen by the student. */
  matchedPairs: Array<{ id: string; right: string }>;
  /** Numeric response (numerical questions). */
  numeric: number | null;
  /** Uploaded file reference (file_upload questions). */
  fileUrl: string | null;
  /** Awarded marks; null until graded. */
  awardedMarks: number | null;
  autoGraded: boolean;
  graderId: ObjectId | null;
  graderNotes: string | null;
}

export interface ExamAttemptDoc extends Document {
  _id: ObjectId;
  examId: ObjectId;
  studentId: ObjectId;
  /** Attempt ordinal (1-based) within the student's attempt allowance. */
  attemptNumber: number;
  status: "in_progress" | "submitted" | "graded";
  answers: ExamAnswer[];
  startedAt: Date;
  submittedAt: Date | null;
  /** Denormalized totals (null until graded / released). */
  score: number | null;
  autoScore: number | null;
  manualScore: number | null;
  maxScore: number;
  percentage: number | null;
  passed: boolean | null;
  gradedBy: ObjectId | null;
  gradedAt: Date | null;
  graderNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignmentSubmissionDoc extends Document {
  _id: ObjectId;
  assignmentId: ObjectId;
  studentId: ObjectId;
  status: "not_started" | "in_progress" | "submitted" | "completed";
  /** Self-reported progress 0-100. */
  progress: number;
  submittedAt: Date | null;
  /** App-served attachment URL (never a raw client path). */
  submissionUrl: string | null;
  submissionName: string | null;
  submissionText: string | null;
  score: number | null;
  feedback: string | null;
  gradedBy: ObjectId | null;
  gradedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TeacherAssignmentStatus = "draft" | "published" | "closed";

export interface TeacherAssignmentDoc extends Document {
  _id: ObjectId;
  title: string;
  description: string | null;
  subject: string;
  classGrade: string;
  courseId: ObjectId | null;
  instructions: string | null;
  status: TeacherAssignmentStatus;
  dueDate: Date | null;
  publishAt: Date | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  maxMarks: number | null;
  /** Denormalized totals; recomputed on publish/submission (never invented). */
  assignedCount: number;
  completedCount: number;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/* Academic / productivity domains (student life OS). Every document is */
/* explicitly owned by one user; all access is owner-scoped.           */
/* ------------------------------------------------------------------ */

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface TaskDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: Date | null;
  courseId: ObjectId | null;
  tags: string[];
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AssignmentStatus = "not_started" | "in_progress" | "submitted" | "completed";

export interface AssignmentDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  description: string | null;
  courseId: ObjectId | null;
  dueDate: Date | null;
  priority: TaskPriority;
  status: AssignmentStatus;
  /** 0-100 self-reported progress. */
  progress: number;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface CourseDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  code: string | null;
  instructor: string | null;
  /** Restricted palette id (validated in Zod, never free-form CSS). */
  color: string;
  room: string | null;
  description: string | null;
  semester: string | null;
  schedule: CourseScheduleSlot[];
  createdAt: Date;
  updatedAt: Date;
}

export type ExamStatus = "scheduled" | "completed" | "cancelled";

export interface ExamDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  courseId: ObjectId | null;
  date: Date;
  endTime: Date | null;
  location: string | null;
  topics: string[];
  /** 0-100 self-reported preparation. */
  preparation: number;
  notes: string | null;
  status: ExamStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Private study notes. Never included in global search by design. */
export interface NoteDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  body: string;
  courseId: ObjectId | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type GoalStatus = "active" | "completed" | "archived";

export interface GoalDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  description: string | null;
  target: number;
  current: number;
  unit: string;
  deadline: Date | null;
  status: GoalStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type HabitFrequency = "daily" | "weekly";

export interface HabitDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  frequency: HabitFrequency;
  /** Required completions per day (daily) or per week (weekly). */
  target: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface HabitLogDoc extends Document {
  _id: ObjectId;
  habitId: ObjectId;
  userId: ObjectId;
  /** Calendar day YYYY-MM-DD (validated). */
  date: string;
  count: number;
  createdAt: Date;
}

export type StudySessionStatus = "active" | "paused" | "completed" | "cancelled";

export interface StudySessionDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  courseId: ObjectId | null;
  subject: string | null;
  note: string | null;
  startedAt: Date;
  /** Set while paused; null otherwise. */
  pauseStartedAt: Date | null;
  /** Accumulated paused seconds (excludes an in-progress pause). */
  pausedSeconds: number;
  endedAt: Date | null;
  status: StudySessionStatus;
  createdAt: Date;
  updatedAt: Date;
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
  "communityChannels",
  "chatConversations",
  "chatMembers",
  "chatMessages",
  "events",
  "eventAttendees",
  "buildings",
  "clubs",
  "videos",
  "videoViews",
  "reels",
  "reelViews",
  "savedReels",
  "stories",
  "storyViews",
  "moderationReviews",
  "classAssignments",
  "assignmentSubmissions",
  "classExams",
  "examAttempts",
  "notifications",
  "reports",
  "moderationActions",
  "blogs",
  "announcements",
  "timetableEntries",
  "polls",
  "pollVotes",
  "settings",
  "feedback",
  "studyMaterials",
  "savedStudyMaterials",
  "auditLogs",
  "tasks",
  "assignments",
  "courses",
  "exams",
  "notes",
  "goals",
  "habits",
  "habitLogs",
  "studySessions",
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
  const failed: string[] = [];
  const idx = (
    name: CollectionName,
    keys: Record<string, 1 | -1>,
    options?: {
      unique?: boolean;
      expireAfterSeconds?: number;
      name?: string;
      sparse?: boolean;
      partialFilterExpression?: Record<string, unknown>;
    }
  ) => {
    jobs.push(db.collection(name).createIndex(keys, options ?? {}));
  };

  idx("users", { email: 1 }, { unique: true });
  idx("users", { username: 1 }, { unique: true });
  idx("users", { role: 1 });
  idx("users", { createdAt: -1 });
  // Admin user-management filters (role + status + class) stay indexed.
  idx("users", { role: 1, classGrade: 1 });
  idx("users", { bannedAt: 1 });
  idx("users", { suspendedUntil: 1 });

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

  idx("savedReels", { userId: 1, createdAt: -1 });
  idx("savedReels", { userId: 1, reelId: 1 }, { unique: true });

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

  idx("communityChannels", { communityId: 1, position: 1 });
  idx("communityChannels", { communityId: 1, name: 1 }, { unique: true });

  idx("chatConversations", { updatedAt: -1 });
  idx("chatConversations", { createdBy: 1 });
  idx("chatConversations", { communityId: 1 });
  idx("chatConversations", { channelId: 1 });

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
  // Feed queries filter on moderation status then sort by time.
  idx("videos", { moderationStatus: 1, createdAt: -1 });
  // Reaction lookups for video/reel like counts and toggles.
  idx("reactions", { targetType: 1, targetId: 1, userId: 1 });

  idx("videoViews", { videoId: 1, userId: 1, createdAt: -1 });

  idx("reels", { moderationStatus: 1, createdAt: -1, _id: -1 });
  idx("reels", { creatorId: 1, createdAt: -1 });
  idx("reels", { category: 1, moderationStatus: 1, createdAt: -1 });
  idx("reels", { likeCount: -1 });
  idx("reels", { viewCount: -1 });
  idx("reelViews", { reelId: 1, userId: 1, hourBucket: 1 }, { unique: true });
  idx("reelViews", { reelId: 1, createdAt: -1 });

  // Stories expire on a hard TTL index, so an expired story physically
  // disappears instead of lingering as permanent content.
  idx("stories", { expiresAt: 1 }, { expireAfterSeconds: 0 });
  idx("stories", { authorId: 1, createdAt: -1 });
  idx("stories", { moderationStatus: 1, createdAt: -1 });
  idx("storyViews", { storyId: 1, userId: 1 }, { unique: true });

  idx("moderationReviews", { status: 1, createdAt: -1 });
  idx("moderationReviews", { contentType: 1, contentId: 1 });
  idx("moderationReviews", { authorId: 1, createdAt: -1 });
  idx("moderationReviews", { conversationId: 1, createdAt: -1 });

  idx("classAssignments", { createdBy: 1, createdAt: -1 });
  idx("classAssignments", { classGrade: 1, status: 1, dueDate: 1 });
  idx("classAssignments", { status: 1, publishAt: 1 });

  idx("assignmentSubmissions", { assignmentId: 1, studentId: 1 }, { unique: true });
  idx("assignmentSubmissions", { studentId: 1, createdAt: -1 });
  idx("assignmentSubmissions", { assignmentId: 1, status: 1 });

  idx("classExams", { createdBy: 1, createdAt: -1 });
  idx("classExams", { classGrade: 1, status: 1, startsAt: -1 });
  idx("classExams", { status: 1, startsAt: -1 });
  idx("examAttempts", { examId: 1, studentId: 1 });
  idx("examAttempts", { examId: 1, score: -1 });
  idx("examAttempts", { studentId: 1, createdAt: -1 });
  idx("examAttempts", { examId: 1, studentId: 1, attemptNumber: 1 }, { unique: true });
  // Hard business-rule guarantee: a student can only ever have ONE open
  // attempt per exam, no matter how many clients race to start one.
  idx(
    "examAttempts",
    { examId: 1, studentId: 1 },
    {
      unique: true,
      name: "uniq_open_attempt_per_exam",
      partialFilterExpression: { status: "in_progress" },
    }
  );

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
  idx("blogs", { moderationStatus: 1, createdAt: -1 });

  idx("announcements", { createdAt: -1 });
  idx("announcements", { isPinned: -1 });
  idx("announcements", { audience: 1, createdAt: -1 });
  // Fan-out idempotency: one notification per (announcement, recipient).
  idx("notifications", { "data.notificationKey": 1 }, { unique: true, sparse: true });

  idx("timetableEntries", { dayOfWeek: 1, periodIndex: 1 });
  idx("timetableEntries", { classGrade: 1 });

  idx("polls", { communityId: 1, createdAt: -1 });
  idx("pollVotes", { pollId: 1, userId: 1 }, { unique: true });

  idx("settings", { key: 1 }, { unique: true });

  idx("feedback", { reporterId: 1, createdAt: -1 });
  idx("feedback", { status: 1, createdAt: -1 });
  idx("feedback", { category: 1 });

  idx("studyMaterials", { subject: 1, classGrade: 1 });
  idx("studyMaterials", { uploaderId: 1 });
  idx("studyMaterials", { createdAt: -1 });
  idx("studyMaterials", { status: 1 });

  idx("savedStudyMaterials", { userId: 1, createdAt: -1 });
  idx("savedStudyMaterials", { userId: 1, materialId: 1 }, { unique: true });

  idx("auditLogs", { actorId: 1, createdAt: -1 });
  idx("auditLogs", { action: 1, createdAt: -1 });
  idx("auditLogs", { createdAt: -1 });

  // Academic / productivity (all owner-scoped).
  idx("tasks", { userId: 1, completedAt: 1 });
  idx("tasks", { userId: 1, dueDate: 1 });
  idx("tasks", { userId: 1, courseId: 1 });
  idx("tasks", { userId: 1, createdAt: -1 });

  idx("assignments", { userId: 1, status: 1 });
  idx("assignments", { userId: 1, dueDate: 1 });
  idx("assignments", { userId: 1, courseId: 1 });

  idx("courses", { userId: 1, createdAt: -1 });
  idx("courses", { userId: 1, name: 1 });

  idx("exams", { userId: 1, date: 1 });
  idx("exams", { userId: 1, courseId: 1 });

  idx("notes", { userId: 1, updatedAt: -1 });
  idx("notes", { userId: 1, courseId: 1 });

  idx("goals", { userId: 1, status: 1 });
  idx("goals", { userId: 1, deadline: 1 });

  idx("habits", { userId: 1, isActive: 1 });

  idx("habitLogs", { habitId: 1, date: 1 }, { unique: true });
  idx("habitLogs", { userId: 1, date: -1 });

  idx("studySessions", { userId: 1, status: 1 });
  idx("studySessions", { userId: 1, startedAt: -1 });

  // Full-text search indexes (one per collection is the MongoDB limit).
  jobs.push(db.collection("posts").createIndex({ content: "text" }));
  jobs.push(db.collection("communities").createIndex({ name: "text", description: "text" }));
  jobs.push(db.collection("events").createIndex({ title: "text", description: "text" }));
  jobs.push(db.collection("videos").createIndex({ title: "text", description: "text" }));
  jobs.push(db.collection("reels").createIndex({ title: "text", caption: "text" }));
  jobs.push(db.collection("users").createIndex({ username: "text", displayName: "text" }));
  jobs.push(db.collection("clubs").createIndex({ name: "text", description: "text" }));
  jobs.push(db.collection("buildings").createIndex({ name: "text", description: "text" }));
  jobs.push(db.collection("blogs").createIndex({ title: "text", excerpt: "text", content: "text" }));
  jobs.push(db.collection("announcements").createIndex({ title: "text", body: "text" }));
  // Private notes are full-text searchable but ONLY ever queried with an
  // owner filter (never exposed to globalSearch).
  jobs.push(db.collection("notes").createIndex({ title: "text", body: "text" }));

  await Promise.allSettled(jobs).then((results) => {
    for (const result of results) {
      if (result.status === "rejected") {
        // A unique index can legitimately fail on a database that already holds
        // conflicting rows (e.g. imported legacy data). Index creation must never
        // take the whole application down; log it and continue so the remaining
        // indexes are still applied.
        failed.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
    }
    if (failed.length > 0) {
      console.warn(`[dyne] ${failed.length} index/indices could not be created on ${db.databaseName}: ${failed.join("; ")}`);
    }
  });
}
