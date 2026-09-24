import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { getSessionUser } from "@/lib/auth/session";
import { AdminPageClient } from "./AdminPageClient";

export const metadata: Metadata = {
  title: "Admin — Dyne",
  description: "Dyne administration dashboard.",
};

export default async function AdminPage() {
  const db = await getDb();
  const user = await getSessionUser(db);

  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/feed");

  return <AdminPageClient />;
}
