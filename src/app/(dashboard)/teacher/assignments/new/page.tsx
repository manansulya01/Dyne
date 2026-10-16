import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { assignableClassGrades } from "@/lib/db/teacherAssignments";

/** Deep link target for the dashboard quick action; renders the manager page. */
export const dynamic = "force-dynamic";

export default async function NewAssignmentPage() {
  const db = await getDb();
  const user = await getSessionUser(db);
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "assignments.create")) redirect("/teacher/assignments");
  await assignableClassGrades(db, user);
  redirect("/teacher/assignments?new=1");
}
