import type { UserRole } from "@/lib/mongo/collections";

/**
 * Central permission model for Dyne.
 *
 * Every privileged action is gated through these strings, server-side. UI
 * hiding is a convenience only — it is never the security boundary.
 *
 * Composition rules (deliberate, not duplicated):
 *   - `admin` inherits the full teacher capability set (no duplicate teacher
 *     implementation for admins).
 *   - `super_admin` inherits everything (`ALL`).
 *   - `staff` inherits the teacher capability set plus user moderation.
 */
export type Permission =
  /* ---- users & identity ---- */
  | "users.read"
  | "users.manage"
  | "users.suspend"
  | "users.ban"
  | "users.unban"
  | "users.restore"
  | "users.reset_password"
  | "users.revoke_sessions"
  /* ---- legacy granular user perms (kept for backwards compatibility) ---- */
  | "users.view"
  /* ---- feed content ---- */
  | "posts.create"
  | "posts.view"
  | "posts.moderate"
  | "posts.remove"
  | "posts.restore"
  | "comments.view"
  | "comments.moderate"
  | "comments.remove"
  | "comments.restore"
  /* ---- reports (user-facing abuse reports) ---- */
  | "reports.view"
  | "reports.resolve"
  | "reports.dismiss"
  | "reports.escalate"
  /* ---- unified moderation centre ---- */
  | "moderation.queue"
  | "moderation.decide"
  | "moderation.override"
  | "moderation.ai_config"
  /* ---- communities / events ---- */
  | "communities.view"
  | "communities.create"
  | "communities.manage"
  | "communities.moderate"
  | "events.view"
  | "events.create"
  | "events.edit"
  | "events.delete"
  | "events.manage"
  /* ---- blogs ---- */
  | "blogs.create"
  | "blogs.edit"
  | "blogs.publish"
  | "blogs.unpublish"
  | "blogs.moderate"
  /* ---- horizontal videos (Dyne Videos) ---- */
  | "videos.view"
  | "videos.create"
  | "videos.edit"
  | "videos.delete"
  | "videos.moderate"
  /* ---- reels (vertical shorts) ---- */
  | "reels.view"
  | "reels.create"
  | "reels.edit"
  | "reels.delete"
  | "reels.moderate"
  /* ---- stories ---- */
  | "stories.view"
  | "stories.create"
  | "stories.delete"
  | "stories.moderate"
  /* ---- announcements ---- */
  | "announcements.view"
  | "announcements.create"
  | "announcements.manage"
  /* ---- study materials ---- */
  | "study.view"
  | "study.upload"
  | "study.manage"
  | "study.feature"
  /* ---- academic: assignments ---- */
  | "assignments.view"
  | "assignments.submit"
  | "assignments.create"
  | "assignments.manage"
  | "assignments.monitor"
  /* ---- academic: exams ---- */
  | "exams.view"
  | "exams.create"
  | "exams.manage"
  | "exams.grade"
  | "exams.take"
  /* ---- academic reporting ---- */
  | "student_reports.read"
  | "academic_reports.read"
  | "analytics.read"
  /* ---- chat ---- */
  | "chat.use"
  | "chat.moderate"
  | "chat.manage"
  /* ---- campus / timetable / feedback ---- */
  | "campus.view"
  | "campus.manage"
  | "timetable.view"
  | "timetable.manage"
  | "feedback.view"
  | "feedback.manage"
  /* ---- platform ---- */
  | "audit.view"
  | "settings.view"
  | "settings.manage"
  | "system.settings"
  | "notifications.manage"
  | "content.manage"
  | "admin.manage";

/* ------------------------------------------------------------------ */
/* Capability bundles                                                 */
/* ------------------------------------------------------------------ */

/** Ordinary signed-in member capabilities (every authenticated role). */
const MEMBER: Permission[] = [
  "users.read",
  "posts.create",
  "posts.view",
  "comments.view",
  "communities.view",
  "communities.create",
  "events.view",
  "videos.view",
  "reels.view",
  "stories.view",
  "announcements.view",
  "study.view",
  "assignments.view",
  "assignments.submit",
  "exams.view",
  "exams.take",
  "student_reports.read",
  "campus.view",
  "timetable.view",
  "chat.use",
  "feedback.view",
  "settings.view",
];

/** Teaching capabilities. Admins inherit this whole set (no duplicate impl). */
const TEACHER: Permission[] = [
  "posts.moderate",
  "posts.remove",
  "posts.restore",
  "comments.moderate",
  "comments.remove",
  "comments.restore",
  "reports.view",
  "reports.resolve",
  "reports.dismiss",
  "reports.escalate",
  "moderation.queue",
  "moderation.decide",
  "communities.moderate",
  "events.create",
  "events.edit",
  "events.manage",
  "blogs.create",
  "blogs.edit",
  "blogs.publish",
  "blogs.moderate",
  "videos.create",
  "videos.edit",
  "videos.delete",
  "videos.moderate",
  "reels.create",
  "reels.edit",
  "reels.delete",
  "reels.moderate",
  "stories.create",
  "stories.delete",
  "stories.moderate",
  "announcements.create",
  "announcements.manage",
  "study.upload",
  "study.manage",
  "assignments.create",
  "assignments.manage",
  "assignments.monitor",
  "exams.create",
  "exams.manage",
  "exams.grade",
  "academic_reports.read",
  "analytics.read",
  "chat.moderate",
  "campus.manage",
  "timetable.manage",
];

/** Full platform administration (admins hold every teacher capability). */
const ADMIN: Permission[] = [
  ...TEACHER,
  "users.manage",
  "users.suspend",
  "users.ban",
  "users.unban",
  "users.restore",
  "users.reset_password",
  "users.revoke_sessions",
  "users.view",
  "moderation.override",
  "moderation.ai_config",
  "communities.manage",
  "events.delete",
  "blogs.unpublish",
  "chat.manage",
  "feedback.manage",
  "audit.view",
  "settings.manage",
  "system.settings",
  "notifications.manage",
  // Featuring/approving study materials and managing platform content.
  "study.feature",
  "content.manage",
];

/** Platform-wide list of every permission the system knows about. */
const ALL: Permission[] = [
  ...MEMBER,
  ...TEACHER,
  ...ADMIN,
  "admin.manage",
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  student: [...MEMBER],
  teacher: [...MEMBER, ...TEACHER],
  // Non-teaching staff: teaching capabilities + user moderation, but NOT
  // academic grading/publishing powers they were not granted.
  staff: [
    ...MEMBER,
    ...TEACHER.filter(
      (p) =>
        !p.startsWith("exams.") &&
        !p.startsWith("assignments.") &&
        !p.startsWith("blogs.") &&
        !p.startsWith("reels.") &&
        !p.startsWith("videos.") &&
        !p.startsWith("stories.") &&
        !p.startsWith("announcements.") &&
        !p.startsWith("study.")
    ),
    "users.manage",
    "users.suspend",
    "users.restore",
    "users.view",
    "moderation.override",
    "feedback.manage",
    "audit.view",
    "settings.manage",
  ],
  club: [
    ...MEMBER,
    "events.create",
    "events.edit",
    "communities.moderate",
    "blogs.create",
    "blogs.edit",
    "blogs.publish",
  ],
  moderator: [
    ...MEMBER,
    "posts.moderate",
    "posts.remove",
    "posts.restore",
    "comments.moderate",
    "comments.remove",
    "comments.restore",
    "reports.view",
    "reports.resolve",
    "reports.dismiss",
    "reports.escalate",
    "moderation.queue",
    "moderation.decide",
    "communities.moderate",
    "events.manage",
    "blogs.moderate",
    "videos.moderate",
    "reels.moderate",
    "stories.moderate",
    "announcements.manage",
    "chat.moderate",
    "campus.manage",
    "users.view",
    "users.suspend",
    "feedback.manage",
  ],
  admin: [...MEMBER, ...ADMIN],
  super_admin: [...ALL],
};

export function allPermissions(): Permission[] {
  return [...new Set(ALL)];
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

function forbidden(): never {
  const err = new Error("Forbidden") as Error & { status?: number };
  err.status = 403;
  throw err;
}

export function requirePermission(role: UserRole, permission: Permission): void {
  if (!hasPermission(role, permission)) forbidden();
}

export function requireAnyPermission(role: UserRole, permissions: Permission[]): void {
  if (!hasAnyPermission(role, permissions)) forbidden();
}

export function requireAllPermissions(role: UserRole, permissions: Permission[]): void {
  if (!hasAllPermissions(role, permissions)) forbidden();
}

/* ------------------------------------------------------------------ */
/* Role predicates                                                     */
/* ------------------------------------------------------------------ */

/** Only accounts explicitly assigned the teacher role may upload study files. Admin and moderation roles may manage library records but cannot publish files as teachers. */
export function canUploadStudyMaterials(role: UserRole): boolean {
  return role === "teacher";
}

/** Roles that may perform moderation work (server-side gate helper). */
export function isModerationRole(role: UserRole): boolean {
  return hasPermission(role, "moderation.queue");
}

/** Roles with academic teaching powers (teacher + every admin tier + club). */
export function isTeachingRole(role: UserRole): boolean {
  return hasPermission(role, "assignments.create");
}

/** Full platform admins (admin console access). */
export function isAdminRole(role: UserRole): boolean {
  return role === "admin" || role === "super_admin";
}

/** Super-admin-only check (role grants + platform settings). */
export function requireSuperAdmin(role: UserRole): void {
  if (role !== "super_admin") forbidden();
}

/**
 * Teacher-scope authorization for a specific student.
 *
 * Admins may view every student. Teachers may only view students they are
 * authorized to teach — i.e. students in a class the teacher owns a published
 * assignment or exam for. Anything else is 403 (not 404: the caller already
 * proved the permission to ask).
 */
export function canManageStudentScope(role: UserRole): "all" | "taught" | "self" | "none" {
  if (isAdminRole(role)) return "all";
  if (hasPermission(role, "assignments.monitor")) return "taught";
  if (hasPermission(role, "student_reports.read")) return "self";
  return "none";
}
