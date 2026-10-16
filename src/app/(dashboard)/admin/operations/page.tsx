import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { AdminPageClient } from "../AdminPageClient";

export const metadata: Metadata = {
  title: "Admin operations — Dyne",
  description: "Reports, feedback and audit log.",
};

export const dynamic = "force-dynamic";

/**
 * Operations workspace: abuse reports, feedback and the audit trail. The admin
 * hub links here; each tab still authorizes its own data server-side.
 */
export default async function AdminOperationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "reports.view")) redirect("/admin");
  return <AdminPageClient currentRole={user.role} />;
}
