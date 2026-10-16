import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { reportableStudents } from "@/lib/db/studentReports";
import { StudentReportsIndex } from "./StudentReportsIndex";

export const metadata: Metadata = {
  title: "Student reports — Dyne",
  description: "Personalized academic and campus activity reports.",
};

export const dynamic = "force-dynamic";

export default async function StudentReportsPage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // A student sees only themselves; teachers/admins get the scoped list.
  const canList =
    hasPermission(user.role, "assignments.monitor") || hasPermission(user.role, "academic_reports.read");

  const result = canList
    ? await reportableStudents(db, user, { limit: 25 }).catch(() => null)
    : null;

  return (
    <StudentReportsIndex
      canList={canList}
      selfId={user.id}
      initialStudents={
        result?.students.map((s) => {
          const raw = s as unknown as Record<string, unknown>;
          return {
            id: String(raw._id ?? ""),
            username: String(raw.username ?? ""),
            display_name: (raw.displayName ?? null) as string | null,
            avatar_url: (raw.avatarUrl ?? null) as string | null,
            class_grade: (raw.classGrade ?? null) as string | null,
            created_at: String(raw.createdAt ?? ""),
          };
        }) ?? []
      }
      initialTotal={result?.total ?? 0}
      initialHasMore={result?.hasMore ?? false}
      taughtClasses={result?.taughtClasses ?? []}
    />
  );
}
