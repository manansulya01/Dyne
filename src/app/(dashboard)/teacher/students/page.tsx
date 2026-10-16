import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { reportableStudents } from "@/lib/db/studentReports";
import { TeacherStudentsClient } from "./TeacherStudentsClient";

export const metadata: Metadata = {
  title: "My students — Dyne",
  description: "Students you are authorized to teach.",
};

export const dynamic = "force-dynamic";

export default async function TeacherStudentsPage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "assignments.monitor")) redirect("/teacher");

  const result = await reportableStudents(db, user, { limit: 25 });
  return (
    <TeacherStudentsClient
      initialStudents={result.students.map((s) => {
        const raw = s as unknown as Record<string, unknown>;
        return {
          id: String(raw._id ?? ""),
          username: String(raw.username ?? ""),
          display_name: (raw.displayName ?? null) as string | null,
          avatar_url: (raw.avatarUrl ?? null) as string | null,
          class_grade: (raw.classGrade ?? null) as string | null,
        };
      })}
      initialTotal={result.total}
      initialHasMore={result.hasMore}
      classes={result.taughtClasses}
    />
  );
}
