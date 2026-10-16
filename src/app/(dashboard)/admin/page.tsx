import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { isAdminRole, isTeachingRole, ROLE_PERMISSIONS } from "@/lib/permissions";
import { AdminHub } from "./AdminHub";

export const metadata: Metadata = {
  title: "Admin — Dyne",
  description: "Dyne administration dashboard.",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Only platform admins reach the console. Teachers have /teacher instead, and
  // students are never offered any staff surface at all.
  if (!isAdminRole(user.role)) redirect(isTeachingRole(user.role) ? "/teacher" : "/dashboard");
  return <AdminHub role={user.role} permissions={ROLE_PERMISSIONS[user.role] ?? []} />;
}
