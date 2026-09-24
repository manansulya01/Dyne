import type { UserRole } from "@/lib/mongo/collections";

export type Permission =
  | "users.view"
  | "users.manage"
  | "users.suspend"
  | "users.ban"
  | "users.restore"
  | "posts.view"
  | "posts.remove"
  | "posts.restore"
  | "comments.remove"
  | "comments.restore"
  | "reports.view"
  | "reports.resolve"
  | "reports.dismiss"
  | "communities.manage"
  | "communities.moderate"
  | "events.create"
  | "events.edit"
  | "events.delete"
  | "blogs.create"
  | "blogs.edit"
  | "blogs.publish"
  | "blogs.unpublish"
  | "campus.manage"
  | "timetable.manage"
  | "announcements.manage"
  | "watch.moderate"
  | "settings.manage"
  | "audit.view";

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  student: [],
  teacher: [
    "users.view",
    "posts.view",
    "reports.view",
    "reports.resolve",
    "reports.dismiss",
    "comments.remove",
    "events.create",
    "events.edit",
    "blogs.create",
    "blogs.edit",
    "announcements.manage",
    "watch.moderate",
  ],
  staff: [
    "users.view",
    "users.manage",
    "users.suspend",
    "posts.view",
    "posts.remove",
    "posts.restore",
    "comments.remove",
    "comments.restore",
    "reports.view",
    "reports.resolve",
    "reports.dismiss",
    "communities.manage",
    "communities.moderate",
    "events.create",
    "events.edit",
    "events.delete",
    "blogs.create",
    "blogs.edit",
    "blogs.publish",
    "blogs.unpublish",
    "campus.manage",
    "timetable.manage",
    "announcements.manage",
    "watch.moderate",
    "settings.manage",
    "audit.view",
  ],
  club: [
    "posts.view",
    "events.create",
    "events.edit",
    "communities.moderate",
  ],
  admin: [
    "users.view",
    "users.manage",
    "users.suspend",
    "users.ban",
    "users.restore",
    "posts.view",
    "posts.remove",
    "posts.restore",
    "comments.remove",
    "comments.restore",
    "reports.view",
    "reports.resolve",
    "reports.dismiss",
    "communities.manage",
    "communities.moderate",
    "events.create",
    "events.edit",
    "events.delete",
    "blogs.create",
    "blogs.edit",
    "blogs.publish",
    "blogs.unpublish",
    "campus.manage",
    "timetable.manage",
    "announcements.manage",
    "watch.moderate",
    "settings.manage",
    "audit.view",
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function requirePermission(role: UserRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

export function requireAnyPermission(role: UserRole, permissions: Permission[]): void {
  if (!hasAnyPermission(role, permissions)) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

export function requireAllPermissions(role: UserRole, permissions: Permission[]): void {
  if (!hasAllPermissions(role, permissions)) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}