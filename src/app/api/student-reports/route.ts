import { NextResponse } from "next/server";
import { buildStudentReport, reportableStudents } from "@/lib/db/studentReports";
import { jsonError, withAnyPermission } from "@/lib/security/authorize";
import { hasPermission } from "@/lib/permissions";
/**
 * Student report index.
 *
 * Students see only themselves. Teachers see only students in classes they
 * actually teach. Admins see every student. This list is never reachable from
 * profiles or search.
 */
export async function GET(request: Request) {
  const auth = await withAnyPermission(["student_reports.read"]);
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 25, 1), 50);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
  const search = searchParams.get("search")?.slice(0, 100) || undefined;
  const classGrade = searchParams.get("classGrade")?.slice(0, 50) || undefined;
  // A student's own report is self-only: no list, no search, no pagination.
  if (!hasPermission(user.role, "assignments.monitor") && !hasPermission(user.role, "academic_reports.read")) {
    const report = await buildStudentReport(db, user.id, "self");
    if (!report) return jsonError(404, "Report not found");
    return NextResponse.json({ report });
  }
  const result = await reportableStudents(db, user, { limit, offset, search, classGrade });
  return NextResponse.json({
    students: result.students.map((s) => {
      const raw = s as unknown as Record<string, unknown>;
      return {
        id: String(raw._id ?? ""),
        username: String(raw.username ?? ""),
        display_name: (raw.displayName ?? null) as string | null,
        avatar_url: (raw.avatarUrl ?? null) as string | null,
        class_grade: (raw.classGrade ?? null) as string | null,
        created_at: raw.createdAt,
      };
    }),
    total: result.total,
    hasMore: result.hasMore,
    taughtClasses: result.taughtClasses,
  });
}