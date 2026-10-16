import { NextResponse } from "next/server";
import { objectIdSchema } from "@/lib/mongo/ids";
import { authorizeReportAccess, buildStudentReport } from "@/lib/db/studentReports";
import { logAudit } from "@/lib/security/audit";
import { jsonError, withAnyPermission } from "@/lib/security/authorize";
interface Params {
  params: Promise<{ id: string }>;
}
/**
 * Personalized student report.
 *
 * Authorization is computed server-side from the session role and the
 * student's actual class — never from a client-supplied role or teacherId:
 *   - student  → own report only
 *   - teacher  → only students in a class they teach
 *   - admin    → any student
 *   - otherwise → 403
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await withAnyPermission(["student_reports.read"]);
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  if (!objectIdSchema.safeParse(id).success) return jsonError(404, "Student not found");
  const access = await authorizeReportAccess(db, user, id);
  if (!access.ok) return jsonError(access.status, access.message);
  const report = await buildStudentReport(db, id, access.scope);
  if (!report) return jsonError(404, "Student not found");
  // Viewing another student's report is an auditable privileged action.
  if (access.scope !== "self") {
    await logAudit(db, {
      actorId: user.id,
      action: "student_report.view",
      targetType: "user",
      targetId: id,
      details: { scope: access.scope },
    });
  }
  return NextResponse.json({ report });
}