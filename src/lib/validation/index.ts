import { z } from "zod";

/** MongoDB ObjectId strings (24 hex chars) replace UUIDs across the API. */
export const objectIdField = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid id format");

/** ISO datetime, bounded to a sane range (rejects junk dates like year 0000). */
const boundedDateTime = z.string().datetime({ offset: true }).refine(
  (s) => {
    const t = new Date(s).getTime();
    return !isNaN(t) && t > new Date("2000-01-01").getTime() && t < new Date("2100-01-01").getTime();
  },
  { message: "Date must be a valid ISO datetime between 2000 and 2100" }
);

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
  profileTags: z.array(z.string().max(24)).max(8).optional(),
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
  content: z.string().max(10000, "Message too long").default(""),
  conversationId: objectIdField,
  // Staged uploads to claim as message attachments (pendingMedia ids owned
  // by the sender in the message-attachments bucket; max 5 per message).
  attachmentIds: z.array(objectIdField).max(5).optional(),
});

/* ---------------- Teacher-authored academic content ---------------- */

export const TEACHER_ASSIGNMENT_STATUSES = ["draft", "published", "closed"] as const;
export const SUBMISSION_STATUSES = ["not_started", "in_progress", "submitted", "completed"] as const;

const teacherAssignmentFields = {
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  subject: z.string().trim().min(1, "Subject is required").max(100),
  classGrade: z.string().trim().min(1, "Class is required").max(50),
  instructions: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(TEACHER_ASSIGNMENT_STATUSES),
  dueDate: boundedDateTime.nullable().optional(),
  publishAt: boundedDateTime.nullable().optional(),
  attachmentUrl: z.string().max(2000).nullable().optional(),
  attachmentName: z.string().max(200).nullable().optional(),
  maxMarks: z.number().int().positive().max(10000).nullable().optional(),
};

export const teacherAssignmentCreateSchema = z.object({
  ...teacherAssignmentFields,
  status: teacherAssignmentFields.status.default("draft"),
});

/* Explicit all-optional update shape (no `.default()` re-application). */
export const teacherAssignmentUpdateSchema = z.object({
  title: teacherAssignmentFields.title.optional(),
  description: teacherAssignmentFields.description,
  subject: teacherAssignmentFields.subject.optional(),
  classGrade: teacherAssignmentFields.classGrade.optional(),
  instructions: teacherAssignmentFields.instructions,
  status: teacherAssignmentFields.status.optional(),
  dueDate: teacherAssignmentFields.dueDate,
  publishAt: teacherAssignmentFields.publishAt,
  attachmentUrl: teacherAssignmentFields.attachmentUrl,
  attachmentName: teacherAssignmentFields.attachmentName,
  maxMarks: teacherAssignmentFields.maxMarks,
});

export const assignmentSubmissionSchema = z.object({
  status: z.enum(SUBMISSION_STATUSES).default("submitted"),
  progress: z.number().int().min(0).max(100).optional(),
  submissionUrl: z.string().max(2000).optional(),
  submissionName: z.string().max(200).optional(),
  submissionText: z.string().max(20000).optional(),
});

export const assignmentGradeSchema = z.object({
  score: z.number().min(0).max(10000).nullable().optional(),
  feedback: z.string().max(5000).nullable().optional(),
});

export const EXAM_QUESTION_TYPES = [
  "mcq",
  "multiple_select",
  "true_false",
  "short_answer",
  "long_answer",
  "fill_blank",
  "matching",
  "assertion_reason",
  "case_based",
  "numerical",
  "descriptive",
  "essay",
  "file_upload",
] as const;

export type ExamQuestionTypeInput = (typeof EXAM_QUESTION_TYPES)[number];

export const EXAM_MODES = ["practice", "timed", "question_paper", "assessment"] as const;
export const CLASS_EXAM_STATUSES = ["draft", "published", "closed", "archived"] as const;

/** Question types the platform can grade deterministically. */
export const AUTO_GRADABLE_TYPES = new Set<ExamQuestionTypeInput>([
  "mcq",
  "multiple_select",
  "true_false",
  "fill_blank",
  "matching",
  "numerical",
]);

const questionOptionSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().trim().min(1).max(500),
  isCorrect: z.boolean().optional(),
});

const matchPairSchema = z.object({
  id: z.string().min(1).max(40),
  left: z.string().trim().min(1).max(300),
  right: z.string().trim().min(1).max(300),
});

/**
 * One flexible question schema for every supported type. Refinement enforces
 * that choice types carry options and that auto-gradable types carry answers.
 */
export const examQuestionSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.enum(EXAM_QUESTION_TYPES),
    prompt: z.string().trim().min(1, "Question text is required").max(5000),
    marks: z.number().int().positive().max(1000),
    difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
    options: z.array(questionOptionSchema).max(12).default([]),
    pairs: z.array(matchPairSchema).max(20).default([]),
    correctAnswers: z.array(z.string().max(500)).max(20).default([]),
    numericRange: z
      .object({ min: z.number(), max: z.number() })
      .nullable()
      .default(null),
    explanation: z.string().max(2000).nullable().default(null),
    attachmentUrl: z.string().max(2000).nullable().default(null),
    caseStudyText: z.string().max(8000).nullable().default(null),
  })
  .superRefine((q, ctx) => {
    const choice = ["mcq", "multiple_select", "true_false"].includes(q.type);
    if (choice && q.options.length < 2) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "At least two options are required" });
    }
    if (q.type === "true_false" && q.options.length !== 0 && q.options.length !== 2) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "True/false takes exactly two options" });
    }
    if (q.type === "matching" && q.pairs.length < 2) {
      ctx.addIssue({ code: "custom", path: ["pairs"], message: "Matching needs at least two pairs" });
    }
    if (q.type === "mcq" && q.options.filter((o) => o.isCorrect).length !== 1) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "MCQ needs exactly one correct option" });
    }
    if (
      q.type === "multiple_select" &&
      (q.options.filter((o) => o.isCorrect).length < 1 ||
        q.options.filter((o) => o.isCorrect).length === q.options.length)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Multiple select needs at least one correct and one incorrect option",
      });
    }
    if (q.type === "fill_blank" && q.correctAnswers.length === 0) {
      ctx.addIssue({ code: "custom", path: ["correctAnswers"], message: "Fill in the blank needs an accepted answer" });
    }
    if (q.type === "numerical" && !q.numericRange && q.correctAnswers.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["numericRange"],
        message: "Numerical questions need an accepted value or a range",
      });
    }
    if (q.numericRange && q.numericRange.min > q.numericRange.max) {
      ctx.addIssue({ code: "custom", path: ["numericRange"], message: "min must be ≤ max" });
    }
    if (q.marks > 1000) {
      ctx.addIssue({ code: "custom", path: ["marks"], message: "Marks look invalid" });
    }
  });

const classExamFields = {
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  subject: z.string().trim().min(1, "Subject is required").max(100),
  classGrade: z.string().trim().min(1, "Class is required").max(50),
  mode: z.enum(EXAM_MODES),
  status: z.enum(CLASS_EXAM_STATUSES),
  instructions: z.string().trim().max(5000).optional().nullable(),
  durationMinutes: z.number().int().min(1).max(600).nullable().optional(),
  startsAt: boundedDateTime,
  endsAt: boundedDateTime.nullable().optional(),
  totalMarks: z.number().int().positive().max(100000),
  passingMarks: z.number().int().min(0).max(100000),
  attemptLimit: z.number().int().min(1).max(10),
};

export const classExamCreateSchema = z
  .object({
    ...classExamFields,
    mode: classExamFields.mode.default("timed"),
    status: classExamFields.status.default("draft"),
    attemptLimit: classExamFields.attemptLimit.default(1),
  })
  .refine((d) => d.passingMarks <= d.totalMarks, {
    message: "Passing marks cannot exceed total marks",
    path: ["passingMarks"],
  });

export const classExamUpdateSchema = z
  .object({
    title: classExamFields.title.optional(),
    description: classExamFields.description,
    subject: classExamFields.subject.optional(),
    classGrade: classExamFields.classGrade.optional(),
    mode: classExamFields.mode.optional(),
    status: classExamFields.status.optional(),
    instructions: classExamFields.instructions,
    durationMinutes: classExamFields.durationMinutes,
    startsAt: classExamFields.startsAt.optional(),
    endsAt: classExamFields.endsAt,
    totalMarks: classExamFields.totalMarks.optional(),
    passingMarks: classExamFields.passingMarks.optional(),
    attemptLimit: classExamFields.attemptLimit.optional(),
  })
  .refine(
    (d) =>
      d.totalMarks === undefined ||
      d.passingMarks === undefined ||
      d.passingMarks <= d.totalMarks,
    { message: "Passing marks cannot exceed total marks", path: ["passingMarks"] }
  );

export const examQuestionsReplaceSchema = z.object({
  questions: z.array(examQuestionSchema).max(200),
});

export const examAttemptStartSchema = z.object({
  examId: objectIdField,
});

export const examSubmitSchema = z.object({
  examId: objectIdField,
  attemptId: objectIdField.optional(),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(40),
        optionIds: z.array(z.string().max(40)).max(12).default([]),
        text: z.string().max(20000).default(""),
        matchedPairs: z
          .array(z.object({ id: z.string().max(40), right: z.string().max(300) }))
          .max(20)
          .default([]),
        numeric: z.number().nullable().default(null),
        fileUrl: z.string().max(2000).nullable().default(null),
      })
    )
    .max(200),
});

export const examGradeSchema = z.object({
  /** Per-question awarded marks. */
  marks: z
    .array(
      z.object({
        questionId: z.string().min(1).max(40),
        awardedMarks: z.number().min(0).max(1000).nullable(),
        notes: z.string().max(2000).nullable().optional(),
      })
    )
    .max(200),
  graderNotes: z.string().max(5000).nullable().optional(),
  resultsReleased: z.boolean().optional(),
});

export const CLASS_EXAM_QUESTION_TYPES = EXAM_QUESTION_TYPES;

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
  targetType: z.enum(["post", "comment", "user", "community", "video", "study_material", "message"]),
  targetId: objectIdField,
  reason: z.enum(REPORT_REASONS),
  description: z.string().max(2000).optional(),
});

export const REPORT_STATUSES_NEW = ["OPEN", "UNDER_REVIEW", "ACTION_TAKEN", "DISMISSED", "ESCALATED"] as const;
export const REPORT_STATUSES_LEGACY = ["pending", "reviewing", "resolved", "dismissed"] as const;

export const FEEDBACK_CATEGORIES = ["bug", "feature", "ui", "content", "safety", "other"] as const;
export const FEEDBACK_STATUSES = ["NEW", "REVIEWING", "PLANNED", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export const FEEDBACK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const feedbackCreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  category: z.enum(FEEDBACK_CATEGORIES).default("other"),
  page: z.string().max(500).optional(),
});

export const feedbackAdminUpdateSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  priority: z.enum(FEEDBACK_PRIORITIES).optional(),
  adminResponse: z.string().max(5000).optional().nullable(),
  internalNotes: z.string().max(5000).optional().nullable(),
});

export const STUDY_MATERIAL_TYPES = [
  "notes",
  "worksheet",
  "assignment",
  "question_paper",
  "revision",
  "reference",
  "presentation",
  "other",
] as const;

export const studyMaterialCreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  subject: z.string().min(1).max(100),
  classGrade: z.string().min(1).max(50),
  topic: z.string().max(100).optional(),
  materialType: z.enum(STUDY_MATERIAL_TYPES).default("other"),
  tags: z.array(z.string().max(30)).max(10).optional().default([]),
  teacher: z.string().max(100).optional(),
  semester: z.string().max(30).optional(),
  academicYear: z.string().max(20).optional(),
  // File reference from /api/upload (bucket study-materials)
  bucket: z.literal("study-materials"),
  key: z.string().min(1).max(300),
  url: z.string().min(1).max(2048),
  mime: z.string().min(1).max(120),
  size: z.number().int().positive().max(50 * 1024 * 1024),
  fileName: z.string().min(1).max(200),
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
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1).max(10000),
  category: z.string().max(50).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  audience: z
    .enum(["all", "students", "teachers", "staff", "selected"])
    .default("all"),
  /** Explicit recipients (only honoured when audience is "selected"). */
  audienceIds: z.array(objectIdField).max(500).optional(),
  audienceClassGrade: z.string().max(50).optional(),
  audienceCommunityId: objectIdField.optional(),
  isPinned: z.boolean().default(false),
  attachmentUrl: z.string().max(2000).optional(),
  attachmentName: z.string().max(200).optional(),
  /** External links must be http(s). */
  linkUrl: z
    .string()
    .max(2000)
    .refine((s) => /^https?:\/\//i.test(s), "Link must start with http:// or https://")
    .optional(),
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

export const preferencesSchema = z.object({  theme: z.enum(["light", "dark", "system"]).optional(),
  accent: z.enum(["dyne-blue", "campus-blue", "midnight", "ocean", "aurora", "forest", "campus", "slate", "violet", "rose", "amber"]).optional(),
  density: z.enum(["compact", "comfortable", "spacious"]).optional(),
  fontScale: z.enum(["small", "medium", "large", "xl"]).optional(),
  motion: z.enum(["full", "reduced", "minimal"]).optional(),
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
export type FeedbackCreateInput = z.infer<typeof feedbackCreateSchema>;
export type StudyMaterialCreateInput = z.infer<typeof studyMaterialCreateSchema>;

/* ---------------- Academic / productivity ---------------- */

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const ASSIGNMENT_STATUSES = ["not_started", "in_progress", "submitted", "completed"] as const;
export const EXAM_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export const GOAL_STATUSES = ["active", "completed", "archived"] as const;
export const HABIT_FREQUENCIES = ["daily", "weekly"] as const;
export const SESSION_STATUSES = ["active", "paused", "completed", "cancelled"] as const;
export const COURSE_COLORS = [
  "green", "blue", "teal", "amber", "red", "purple", "slate", "rose",
] as const;

const tagsField = z.array(z.string().trim().min(1).max(30)).max(10);
const tagsFieldDefault = tagsField.default([]);
const optionalCourse = objectIdField.nullable().optional();

/* NOTE: update schemas are explicit all-optional shapes WITHOUT defaults.
 * `.partial()` on a schema with `.default()`s silently re-applies those
 * defaults on PATCH, wiping fields the caller never sent. */

const courseFields = {
  name: z.string().trim().min(1, "Course name is required").max(100),
  code: z.string().trim().max(20).optional().nullable(),
  instructor: z.string().trim().max(100).optional().nullable(),
  color: z.enum(COURSE_COLORS),
  room: z.string().trim().max(50).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  semester: z.string().trim().max(50).optional().nullable(),
  schedule: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  })).max(20),
};

export const courseCreateSchema = z.object({
  ...courseFields,
  color: courseFields.color.default("green"),
  schedule: courseFields.schedule.default([]),
});

export const courseUpdateSchema = z.object({
  name: courseFields.name.optional(),
  code: courseFields.code,
  instructor: courseFields.instructor,
  color: courseFields.color.optional(),
  room: courseFields.room,
  description: courseFields.description,
  semester: courseFields.semester,
  schedule: courseFields.schedule.optional(),
});

const taskFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: boundedDateTime.nullable().optional(),
  courseId: optionalCourse,
  tags: tagsField,
};

export const taskCreateSchema = z.object({
  ...taskFields,
  priority: taskFields.priority.default("medium"),
  tags: tagsFieldDefault,
});

export const taskUpdateSchema = z.object({
  title: taskFields.title.optional(),
  description: taskFields.description,
  priority: taskFields.priority.optional(),
  dueDate: taskFields.dueDate,
  courseId: taskFields.courseId,
  tags: taskFields.tags.optional(),
});

const assignmentFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  courseId: optionalCourse,
  dueDate: boundedDateTime.nullable().optional(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(ASSIGNMENT_STATUSES),
  progress: z.number().int().min(0).max(100),
};

export const assignmentCreateSchema = z.object({
  ...assignmentFields,
  priority: assignmentFields.priority.default("medium"),
  status: assignmentFields.status.default("not_started"),
  progress: assignmentFields.progress.default(0),
});

export const assignmentUpdateSchema = z.object({
  title: assignmentFields.title.optional(),
  description: assignmentFields.description,
  courseId: assignmentFields.courseId,
  dueDate: assignmentFields.dueDate,
  priority: assignmentFields.priority.optional(),
  status: assignmentFields.status.optional(),
  progress: assignmentFields.progress.optional(),
});

const examFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  courseId: optionalCourse,
  date: boundedDateTime,
  endTime: boundedDateTime.nullable().optional(),
  location: z.string().trim().max(200).optional().nullable(),
  topics: z.array(z.string().trim().min(1).max(60)).max(20),
  preparation: z.number().int().min(0).max(100),
  notes: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(EXAM_STATUSES),
};

export const examCreateSchema = z.object({
  ...examFields,
  topics: examFields.topics.default([]),
  preparation: examFields.preparation.default(0),
  status: examFields.status.default("scheduled"),
});

export const examUpdateSchema = z.object({
  title: examFields.title.optional(),
  courseId: examFields.courseId,
  date: examFields.date.optional(),
  endTime: examFields.endTime,
  location: examFields.location,
  topics: examFields.topics.optional(),
  preparation: examFields.preparation.optional(),
  notes: examFields.notes,
  status: examFields.status.optional(),
});

const noteFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().max(50000),
  courseId: optionalCourse,
  tags: tagsField,
};

export const noteCreateSchema = z.object({
  ...noteFields,
  body: noteFields.body.default(""),
  tags: tagsFieldDefault,
});

export const noteUpdateSchema = z.object({
  title: noteFields.title.optional(),
  body: noteFields.body.optional(),
  courseId: noteFields.courseId,
  tags: noteFields.tags.optional(),
});

const goalFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  target: z.number().positive("Target must be positive").max(1000000000),
  current: z.number().min(0),
  unit: z.string().trim().min(1).max(30),
  deadline: boundedDateTime.nullable().optional(),
  status: z.enum(GOAL_STATUSES),
};

export const goalCreateSchema = z.object({
  ...goalFields,
  current: goalFields.current.default(0),
  unit: goalFields.unit.default("units"),
  status: goalFields.status.default("active"),
});

export const goalUpdateSchema = z.object({
  title: goalFields.title.optional(),
  description: goalFields.description,
  target: goalFields.target.optional(),
  current: goalFields.current.optional(),
  unit: goalFields.unit.optional(),
  deadline: goalFields.deadline,
  status: goalFields.status.optional(),
});

const habitFields = {
  name: z.string().trim().min(1, "Name is required").max(100),
  frequency: z.enum(HABIT_FREQUENCIES),
  target: z.number().int().min(1).max(100),
  isActive: z.boolean(),
};

export const habitCreateSchema = z.object({
  ...habitFields,
  frequency: habitFields.frequency.default("daily"),
  target: habitFields.target.default(1),
  isActive: habitFields.isActive.default(true),
});

export const habitUpdateSchema = z.object({
  name: habitFields.name.optional(),
  frequency: habitFields.frequency.optional(),
  target: habitFields.target.optional(),
  isActive: habitFields.isActive.optional(),
});

export const habitLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  count: z.number().int().min(0).max(1000).default(1),
});

export const studySessionCreateSchema = z.object({
  courseId: optionalCourse,
  subject: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const studySessionUpdateSchema = z.object({
  action: z.enum(["pause", "resume", "finish", "cancel"]),
  courseId: optionalCourse,
  subject: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export type CourseCreateInput = z.infer<typeof courseCreateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>;
export type ExamCreateInput = z.infer<typeof examCreateSchema>;
export type NoteCreateInput = z.infer<typeof noteCreateSchema>;
export type GoalCreateInput = z.infer<typeof goalCreateSchema>;
export type HabitCreateInput = z.infer<typeof habitCreateSchema>;
export type StudySessionCreateInput = z.infer<typeof studySessionCreateSchema>;
export type TeacherAssignmentCreateInput = z.infer<typeof teacherAssignmentCreateSchema>;
export type TeacherAssignmentUpdateInput = z.infer<typeof teacherAssignmentUpdateSchema>;
export type AssignmentSubmissionInput = z.infer<typeof assignmentSubmissionSchema>;
export type ClassExamCreateInput = z.infer<typeof classExamCreateSchema>;
export type ClassExamUpdateInput = z.infer<typeof classExamUpdateSchema>;
export type ExamQuestionInput = z.infer<typeof examQuestionSchema>;
export type ExamSubmitInput = z.infer<typeof examSubmitSchema>;
export type ExamGradeInput = z.infer<typeof examGradeSchema>;
