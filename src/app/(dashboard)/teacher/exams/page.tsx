import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { assignableClassGrades } from "@/lib/db/teacherAssignments";
import { ExamsManager } from "./ExamsManager";

export const metadata: Metadata = {
  title: "Exams — Dyne",
  description: "Create, publish and grade class exams.",
};

export const dynamic = "force-dynamic";

export default async function TeacherExamsPage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "exams.create")) redirect("/dashboard");
  const classes = await assignableClassGrades(db, user);
  return <ExamsManager classes={classes} canCreate={hasPermission(user.role, "exams.create")} />;
}
