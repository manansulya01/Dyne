import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { AdminAnalytics } from "./AdminAnalytics";

export const metadata: Metadata = {
  title: "Platform analytics — Dyne Admin",
  description: "Real usage and academic statistics.",
};

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "analytics.read")) redirect("/admin");
  return <AdminAnalytics role={user.role} />;
}
