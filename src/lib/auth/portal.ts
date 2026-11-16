import type { UserRole } from "@/lib/mongo/collections";

export type StaffPortal = "teacher" | "staff" | "admin";

/**
 * Portals are routing conveniences, never role grants. Keep this mapping
 * centralized so every login entry point enforces the same canonical role.
 */
export function canAccessStaffPortal(role: UserRole, portal: StaffPortal): boolean {
  switch (portal) {
    case "teacher":
      return role === "teacher";
    case "staff":
      return role === "staff";
    case "admin":
      return role === "admin" || role === "super_admin";
  }
}

/** Safe post-auth destination derived only from the persisted account role. */
export function getRoleHomePath(role: UserRole): string {
  if (role === "admin" || role === "super_admin") return "/admin";
  if (role === "teacher") return "/teacher";
  if (role === "staff") return "/dashboard";
  return "/feed";
}
