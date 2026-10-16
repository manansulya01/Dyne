import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { assignableClassGrades } from "@/lib/db/teacherAssignments";
import { AssignmentsManager } from "./AssignmentsManager";

export const metadata: Metadata = {
  title: "Class assignments — Dyne",
  description: "Create and monitor class assignments.",
};

export const dynamic = "force-dynamic";

export default async function TeacherAssignmentsPage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "assignments.manage")) redirect("/dashboard");
  const classes = await assignableClassGrades(db, user);
  return (
    <AssignmentsManager classes={classes} canCreate={hasPermission(user.role, "assignments.create")} />
  );
}
