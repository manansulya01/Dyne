import { z } from "zod";

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
});

export const postCreateSchema = z.object({
  content: z.string().max(5000, "Post content must be at most 5000 characters").optional(),
  mediaIds: z.array(z.string().uuid()).optional(),
});

export const commentCreateSchema = z.object({
  postId: z.string().uuid(),
  content: z.string().min(1, "Comment cannot be empty").max(2000, "Comment must be at most 2000 characters"),
  parentCommentId: z.string().uuid().optional(),
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
  locationId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  isPublic: z.boolean().default(true),
  maxAttendees: z.number().int().positive().optional(),
});

export const messageCreateSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(10000, "Message too long"),
  conversationId: z.string().uuid(),
  attachmentIds: z.array(z.string().uuid()).optional(),
});

export const reportCreateSchema = z.object({
  targetType: z.enum(["post", "comment", "user", "community", "video"]),
  targetId: z.string().uuid(),
  reason: z.string().min(1, "Reason is required").max(100, "Reason too long"),
  description: z.string().max(2000).optional(),
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