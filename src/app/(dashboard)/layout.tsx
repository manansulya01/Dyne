import { redirect } from "next/navigation";
import { requireAuth, getFullUser } from "@/lib/auth/server";
import { toProfileJSON } from "@/lib/db/contracts";
import { DashboardClientLayout } from "./DashboardClientLayout";

// All dashboard routes are session-dependent: never prerender at build time.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();
  const full = await getFullUser(user.id);

  if (!full) {
    redirect("/login");
  }

  return <DashboardClientLayout profile={toProfileJSON(full as unknown as Record<string, unknown>)}>{children}</DashboardClientLayout>;
}
