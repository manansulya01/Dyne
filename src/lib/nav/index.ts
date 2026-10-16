import type { LucideIcon } from "lucide-react";

/**
 * Role-aware navigation model.
 *
 * Navigation is a convenience, not a security boundary: every route the
 * links point to re-checks permissions server-side, and every API enforces
 * them again. Students never see teacher or admin controls; teachers never see
 * platform administration.
 */

export type NavItem = {
  name: string;
  href: string;
  /** Key into the icon map; resolved to a component by the client layout. */
  icon: string;
  /** Permission required for the link to be shown. */
  permission?: string;
  /** Roles allowed regardless of the permission list. */
  roles?: string[];
  mobile?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

/** Icons are injected by the client layout to keep this module data-only. */
export interface NavIconMap {
  [key: string]: LucideIcon;
}

/** A nav item after its icon has been resolved for rendering. */
export type ResolvedNavItem = Omit<NavItem, "icon"> & { icon: LucideIcon };

/**
 * Every privileged link declares its required permission here, so adding a
 * feature cannot accidentally expose a control to the wrong role.
 */
export const NAV_DEFS: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Academic",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
      { name: "Tasks", href: "/tasks", icon: "ListTodo" },
      { name: "My tasks", href: "/assignments", icon: "ListTodo" },
      { name: "Class work", href: "/class-assignments", icon: "ClipboardList" },
      { name: "Courses", href: "/courses", icon: "BookOpen" },
      { name: "My exams", href: "/exams", icon: "CalendarClock" },
      { name: "Class exams", href: "/class-exams", icon: "GraduationCap" },
      { name: "Notes", href: "/notes", icon: "NotebookPen" },
      { name: "Goals", href: "/goals", icon: "Target" },
      { name: "Habits", href: "/habits", icon: "Flame" },
      { name: "Study Sessions", href: "/study-sessions", icon: "Timer" },
      { name: "Analytics", href: "/analytics", icon: "BarChart3" },
      { name: "Schedule", href: "/schedule", icon: "CalendarClock" },
      { name: "Timetable", href: "/timetable", icon: "CalendarClock" },
      { name: "Calendar", href: "/calendar", icon: "CalendarDays" },
      // Teacher / admin academic workspace.
      { name: "Teaching", href: "/teacher", icon: "School", permission: "assignments.create" },
      { name: "Class assignments", href: "/teacher/assignments", icon: "ClipboardCheck", permission: "assignments.manage" },
      { name: "Exams builder", href: "/teacher/exams", icon: "GraduationCap", permission: "exams.create" },
      { name: "My students", href: "/teacher/students", icon: "Users", permission: "assignments.monitor" },
      { name: "Student reports", href: "/reports/students", icon: "FileBarChart", permission: "student_reports.read" },
    ],
  },
  {
    group: "Campus",
    items: [
      { name: "Campus", href: "/campus", icon: "Building2" },
      { name: "Events", href: "/events", icon: "CalendarPlus" },
      { name: "MVA Events", href: "/mva-events", icon: "CalendarDays" },
      { name: "Announcements", href: "/announcements", icon: "Megaphone", permission: "announcements.view" },
    ],
  },
  {
    group: "Community",
    items: [
      { name: "Feed", href: "/feed", icon: "House" },
      { name: "Communities", href: "/communities", icon: "Users" },
      { name: "People", href: "/people", icon: "Users" },
      { name: "Explore", href: "/explore", icon: "Compass" },
      { name: "Saved", href: "/saved", icon: "Bookmark" },
    ],
  },
  {
    group: "Communication",
    items: [{ name: "Spaces", href: "/chat", icon: "MessagesSquare" }],
  },
  {
    group: "Learning",
    items: [
      { name: "Study Materials", href: "/study-materials", icon: "BookOpen" },
      { name: "Blogs", href: "/blogs", icon: "Newspaper" },
      { name: "Videos", href: "/videos", icon: "Clapperboard" },
      { name: "Reels", href: "/reels", icon: "PlaySquare" },
      { name: "Stories", href: "/stories", icon: "Images" },
    ],
  },
  {
    group: "Administration",
    items: [
      { name: "Admin console", href: "/admin", icon: "ShieldCheck", roles: ["admin", "super_admin"] },
      { name: "Users", href: "/admin/users", icon: "Users", permission: "users.manage" },
      { name: "Moderation", href: "/admin/moderation", icon: "ShieldAlert", permission: "moderation.queue" },
      { name: "Analytics", href: "/admin/analytics", icon: "BarChart3", permission: "analytics.read" },
      { name: "Content", href: "/admin/content", icon: "Library", permission: "content.manage" },
    ],
  },
  {
    group: "Personal",
    items: [
      { name: "Notifications", href: "/notifications", icon: "Bell" },
      { name: "Settings", href: "/settings", icon: "Settings" },
      { name: "Feedback", href: "/feedback", icon: "MessageSquareWarning" },
    ],
  },
];

/** Bottom-bar navigation on small screens. */
export const MOBILE_NAV: NavItem[] = [
  { name: "Home", href: "/feed", icon: "House", mobile: true },
  { name: "Explore", href: "/explore", icon: "Compass", mobile: true },
  { name: "Reels", href: "/reels", icon: "PlaySquare", mobile: true },
  { name: "Spaces", href: "/chat", icon: "MessagesSquare", mobile: true },
  { name: "More", href: "/settings", icon: "Menu", mobile: true },
];

/**
 * Filter the navigation for a role.
 * An item is visible when its role list matches, or when the role holds the
 * declared permission. Items with neither are visible to everyone.
 */
export function navGroupsForRole(
  role: string | undefined | null,
  hasPermissionFor: (permission: string) => boolean,
  icons: NavIconMap
): Array<{ label: string; items: ResolvedNavItem[] }> {
  const visible = (item: NavItem): boolean => {
    if (item.roles) return !!role && item.roles.includes(role);
    if (item.permission) return !!role && hasPermissionFor(item.permission);
    return true;
  };
  const resolve = (item: NavItem): ResolvedNavItem => ({
    ...item,
    icon: icons[item.icon] ?? icons.House,
  });
  if (!role) {
    return NAV_DEFS.filter((g) => g.group !== "Administration").map((g) => ({
      label: g.group,
      items: g.items.filter((i) => !i.permission && !i.roles).map(resolve),
    }));
  }
  return NAV_DEFS.map((g) => ({
    label: g.group,
    items: g.items.filter(visible).map(resolve),
  })).filter((g) => g.items.length > 0);
}

export function mobileNavForRole(
  role: string | undefined | null,
  hasPermissionFor: (permission: string) => boolean,
  icons: NavIconMap
): ResolvedNavItem[] {
  return MOBILE_NAV.filter((item) => {
    if (item.roles) return !!role && item.roles.includes(role);
    if (item.permission) return !!role && hasPermissionFor(item.permission);
    return true;
  }).map((item) => ({ ...item, icon: icons[item.icon] ?? icons.House }));
}
