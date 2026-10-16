import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { ModerationCentre } from "./ModerationCentre";

export const metadata: Metadata = {
  title: "Moderation centre — Dyne Admin",
  description: "Review flagged and pending content across Dyne.",
};

export const dynamic = "force-dynamic";

export default async function AdminModerationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Server gate; the API re-checks the same permission.
  if (!hasPermission(user.role, "moderation.queue")) redirect("/admin");
  return <ModerationCentre />;
}
