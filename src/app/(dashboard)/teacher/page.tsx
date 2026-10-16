import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { TeacherDashboard } from "./TeacherDashboard";

/**
 * Teacher dashboard.
 *
 * Server-gated: only roles holding `assignments.create` (teacher + admins,
 * who inherit teacher capabilities) can reach it.
 */
export const metadata: Metadata = {
  title: "Teacher — Dyne",
  description: "Teaching workspace: assignments, exams, students and reports.",
};

export const dynamic = "force-dynamic";

export default async function TeacherPage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "assignments.create")) redirect("/dashboard");
  return <TeacherDashboard role={user.role} userId={user.id} />;
}
