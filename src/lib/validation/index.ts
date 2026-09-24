import { z } from "zod";

/** MongoDB ObjectId strings (24 hex chars) replace UUIDs across the API. */
export const objectIdField = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid id format");

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signupSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username must be at most 30 characters")
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores"
      ),
    displayName: z
      .string()
      .min(1, "Display name is required")
      .max(50, "Display name must be at most 50 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const updatePasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .min(1, "Display name is required")
    .max(50, "Display name must be at most 50 characters")
    .optional(),
  bio: z.string().max(500, "Bio must be at most 500 characters").optional(),
  classGrade: z.string().max(50).optional(),
  house: z.string().max(50).optional(),
  interests: z.array(z.string().max(30)).max(10).optional(),
  coverImageUrl: z.string().url().max(2048).optional().or(z.literal("")),
  accent: z.string().max(30).optional(),
});

export const postCreateSchema = z.object({
  content: z.string().max(5000, "Post content must be at most 5000 characters").optional(),
  mediaIds: z.array(objectIdField).optional(),
});

export const commentCreateSchema = z.object({
  postId: objectIdField,
  content: z.string().min(1, "Comment cannot be empty").max(2000, "Comment must be at most 2000 characters"),
  parentCommentId: objectIdField.optional(),
});

export const communityCreateSchema = z.object({
  name: z.string().min(3, "Community name must be at least 3 characters").max(100, "Community name must be at most 100 characters"),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .max(50, "Slug must be at most 50 characters")
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  description: z.string().max(2000, "Description must be at most 2000 characters").optional(),
  isPrivate: z.boolean().default(false),
});

export const eventCreateSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200, "Title must be at most 200 characters"),
  description: z.string().max(5000, "Description must be at most 5000 characters").optional(),
  locationId: objectIdField.optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  isPublic: z.boolean().default(true),
  maxAttendees: z.number().int().positive().optional(),
});

export const messageCreateSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(10000, "Message too long"),
  conversationId: objectIdField,
  // NOTE: file attachments are rendered by clients but uploaded through
  // /api/upload + pending-media claims; there is intentionally no
  // attachment-ids field here so unsupported input cannot be silently dropped.
});

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "bullying",
  "hate",
  "sexual_content",
  "violence",
  "self_harm",
  "impersonation",
  "privacy",
  "copyright",
  "misinformation",
  "other",
] as const;

export const reportCreateSchema = z.object({
  targetType: z.enum(["post", "comment", "user", "community", "video"]),
  targetId: objectIdField,
  reason: z.enum(REPORT_REASONS),
  description: z.string().max(2000).optional(),
});

export const blogCreateSchema = z.object({
  title: z.string().min(3).max(200),
  slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/).optional(),
  excerpt: z.string().max(500).optional(),
  content: z.string().min(10).max(50000),
  coverImageUrl: z.string().url().optional().or(z.literal("")),
  category: z.string().max(50).optional(),
  isPublished: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
});

export const announcementCreateSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(1).max(10000),
  category: z.string().max(50).optional(),
  audience: z.enum(["all", "students", "staff"]).default("all"),
  isPinned: z.boolean().default(false),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export const timetableEntrySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  periodIndex: z.number().int().min(0).max(20),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  subject: z.string().min(1).max(100),
  room: z.string().max(50).optional(),
  teacher: z.string().max(100).optional(),
  classGrade: z.string().max(50).optional(),
});

export const pollCreateSchema = z.object({
  communityId: objectIdField,
  question: z.string().min(3).max(500),
  options: z.array(z.string().min(1).max(120)).min(2).max(6),
  closesAt: z.string().datetime().optional(),
});

export const preferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  accent: z.enum(["dyne-blue", "midnight", "aurora", "campus", "slate", "ocean"]).optional(),
  density: z.enum(["comfortable", "compact"]).optional(),
  fontScale: z.enum(["small", "medium", "large", "xl"]).optional(),
  motion: z.enum(["full", "reduced"]).optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  notifySocial: z.boolean().optional(),
  notifyMessages: z.boolean().optional(),
  notifyCommunities: z.boolean().optional(),
  notifyEvents: z.boolean().optional(),
  profileVisibility: z.enum(["public", "campus", "private"]).optional(),
  messagePermissions: z.enum(["everyone", "following", "none"]).optional(),
  activityVisibility: z.enum(["everyone", "following", "private"]).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PostCreateInput = z.infer<typeof postCreateSchema>;
export type CommentCreateInput = z.infer<typeof commentCreateSchema>;
export type CommunityCreateInput = z.infer<typeof communityCreateSchema>;
export type EventCreateInput = z.infer<typeof eventCreateSchema>;
export type MessageCreateInput = z.infer<typeof messageCreateSchema>;
export type ReportCreateInput = z.infer<typeof reportCreateSchema>;
export type BlogCreateInput = z.infer<typeof blogCreateSchema>;
export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>;
export type TimetableEntryInput = z.infer<typeof timetableEntrySchema>;
export type PollCreateInput = z.infer<typeof pollCreateSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;