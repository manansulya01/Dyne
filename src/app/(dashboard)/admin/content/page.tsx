import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { AdminContentPanel } from "./AdminContentPanel";

export const metadata: Metadata = {
  title: "Content — Dyne Admin",
  description: "Publish and manage platform content.",
};

export const dynamic = "force-dynamic";

export default async function AdminContentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "content.manage")) redirect("/admin");
  return <AdminContentPanel />;
}
