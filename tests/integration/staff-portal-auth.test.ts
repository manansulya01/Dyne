import { describe, expect, it } from "vitest";
import { canAccessStaffPortal, getRoleHomePath } from "@/lib/auth/portal";

describe("staff portal authentication policy", () => {
  it("allows each account only into its assigned portal", () => {
    expect(canAccessStaffPortal("teacher", "teacher")).toBe(true);
    expect(canAccessStaffPortal("staff", "staff")).toBe(true);
    expect(canAccessStaffPortal("admin", "admin")).toBe(true);
    expect(canAccessStaffPortal("super_admin", "admin")).toBe(true);
  });

  it("does not allow portal selection to elevate another role", () => {
    for (const role of ["student", "club", "moderator", "staff", "teacher"] as const) {
      expect(canAccessStaffPortal(role, "admin")).toBe(false);
    }
    expect(canAccessStaffPortal("staff", "teacher")).toBe(false);
    expect(canAccessStaffPortal("teacher", "staff")).toBe(false);
    expect(canAccessStaffPortal("student", "staff")).toBe(false);
  });

  it("routes signed-in accounts to their own workspace", () => {
    expect(getRoleHomePath("super_admin")).toBe("/admin");
    expect(getRoleHomePath("admin")).toBe("/admin");
    expect(getRoleHomePath("teacher")).toBe("/teacher");
    expect(getRoleHomePath("staff")).toBe("/dashboard");
    expect(getRoleHomePath("student")).toBe("/feed");
    expect(getRoleHomePath("club")).toBe("/feed");
    expect(getRoleHomePath("moderator")).toBe("/feed");
  });
});
