import { NextResponse } from "next/server";
import { objectIdSchema } from "@/lib/mongo/ids";
import { adminUserDetail } from "@/lib/db/adminUsers";
import { authorizeReportAccess, buildStudentReport } from "@/lib/db/studentReports";
import { jsonError, withAnyPermission } from "@/lib/security/authorize";
import { hasPermission } from "@/lib/permissions";
interface Params {
  params: Promise<{ id: string }>;
}
/**
 * Admin / teacher user detail.
 *
 * Returns profile, account status, real activity + academic summaries, audit
 * history where the caller is authorized, and (for teachers/admins) the
 * student's report. NEVER returns password material of any kind.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await withAnyPermission(["users.view", "users.manage"]);
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "User not found");
  const detail = await adminUserDetail(db, id);
  if (!detail) return jsonError(404, "User not found");
  // A teacher without monitor rights must not read arbitrary users. Admins and
  // roles holding `users.view` (moderators/staff) may.
  const canSeeAcademic = hasPermission(user.role, "assignments.monitor");
  const response: Record<string, unknown> = {
    ...detail,
    canViewAcademicReport: false,
  };
  if (canSeeAcademic) {
    const access = await authorizeReportAccess(db, user, id);
    response.canViewAcademicReport = access.ok;
    if (access.ok) {
      const report = await buildStudentReport(db, id, access.scope);
      response.report = report;
    }
  }
  return NextResponse.json(response);
}