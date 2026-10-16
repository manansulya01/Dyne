/**
 * Shared frontend-facing types.
 *
 * NOTE (cleanup): this file previously carried a full set of legacy
 * Supabase-era table types (Role, UserRoleAssignment, Community,
 * Conversation, Message, Event, Video, Notification, Report, …). None of
 * them were imported anywhere — the MongoDB domain model lives in
 * `src/lib/mongo/collections.ts` and API shapes come from
 * `src/lib/db/contracts.ts`. The dead types were removed so future code
 * cannot accidentally depend on stale shapes (e.g. a 5-role UserRole or
 * legacy lowercase report statuses).
 *
 * Only the post types below are imported by UI code (feed + saved).
 */

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: UserRole;
  class_grade: string | null;
  house: string | null;
  interests: string[];
  created_at: string;
  updated_at: string;
  last_active_at: string | null;
}

export type UserRole =
  | "student"
  | "teacher"
  | "staff"
  | "club"
  | "moderator"
  | "admin"
  | "super_admin";

export type PostType =
  | "post"
  | "blog"
  | "story"
  | "announcement"
  | "assignment"
  | "exam";

export interface Post {
  id: string;
  author_id: string;
  content: string | null;
  post_type: PostType;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PostWithRelations extends Post {
  author: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> | null;
  media: PostMedia[];
  reaction_count: number;
  comment_count: number;
}

export interface PostMedia {
  id: string;
  post_id: string;
  media_type: "image" | "video" | "file";
  url: string;
  thumbnail_url: string | null;
  order_index: number;
  created_at: string;
}

/* Academic / productivity API shapes (mirror `src/lib/db/contracts.ts`). */

export interface CourseBrief {
  id: string;
  name: string;
  color: string;
}

export interface TaskJSON {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  due_date: string | null;
  course_id: string | null;
  course: CourseBrief | null;
  tags: string[];
  completed_at: string | null;
  created_at: string;
  updated_at?: string;
}

export interface AssignmentJSON {
  id: string;
  title: string;
  description: string | null;
  course_id: string | null;
  course: CourseBrief | null;
  due_date: string | null;
  priority: TaskJSON["priority"];
  status: "not_started" | "in_progress" | "submitted" | "completed";
  progress: number;
  completed_at: string | null;
  created_at: string;
}

export interface CourseJSON {
  id: string;
  name: string;
  code: string | null;
  instructor: string | null;
  color: string;
  room: string | null;
  description: string | null;
  semester: string | null;
  schedule: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  counts: {
    open_tasks: number;
    open_assignments: number;
    upcoming_exams: number;
    notes: number;
  } | null;
  created_at: string;
}

export interface ExamJSON {
  id: string;
  title: string;
  course_id: string | null;
  course: CourseBrief | null;
  date: string;
  end_time: string | null;
  location: string | null;
  topics: string[];
  preparation: number;
  notes: string | null;
  status: "scheduled" | "completed" | "cancelled";
  created_at: string;
}

export interface NoteJSON {
  id: string;
  title: string;
  body: string;
  course_id: string | null;
  course: CourseBrief | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface GoalJSON {
  id: string;
  title: string;
  description: string | null;
  target: number;
  current: number;
  unit: string;
  deadline: string | null;
  status: "active" | "completed" | "archived";
  created_at: string;
}

export interface HabitJSON {
  id: string;
  name: string;
  frequency: "daily" | "weekly";
  target: number;
  is_active: boolean;
  today_count: number;
  streak: number;
  created_at: string;
}

export interface StudySessionJSON {
  id: string;
  course_id: string | null;
  course: CourseBrief | null;
  subject: string | null;
  note: string | null;
  started_at: string;
  ended_at: string | null;
  status: "active" | "paused" | "completed" | "cancelled";
  duration_seconds: number;
  created_at: string;
}
