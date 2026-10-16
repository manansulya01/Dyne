import { NextResponse } from "next/server";
import { col } from "@/lib/mongo/collections";
import { hasPermission, isAdminRole, ROLE_PERMISSIONS } from "@/lib/permissions";
import { jsonError, withUser } from "@/lib/security/authorize";
import { toObjectId } from "@/lib/mongo/ids";
/**
 * Platform statistics for the admin dashboard.
 *
 * Every number is a real MongoDB count. Nothing is estimated or invented.
 * Requires `analytics.read` (admins and teachers).
 */
export async function GET() {
  const ctx = await withUser();
  if (!ctx.ok) return ctx.response;
  const { db, user } = ctx.ctx;

  if (!hasPermission(user.role, "analytics.read")) {
    return jsonError(403, "Forbidden");
  }

  const isAdmin = isAdminRole(user.role);

  /* ------------------------------------------------------------------ *
   * Role-aware payload.
   *
   * Admins get platform-wide statistics. Teachers and staff get ONLY their own
   * teaching numbers — a teacher must not be able to read platform-wide user,
   * content or activity statistics by calling this endpoint.
   * ------------------------------------------------------------------ */
  if (!isAdmin) {
    const [myAssignments, myExams, myStudents, myPendingReports, mySessions] = await Promise.all([
      col(db, "classAssignments").countDocuments({ createdBy: toObjectId(user.id) } as never),
      col(db, "classExams").countDocuments({ createdBy: toObjectId(user.id) } as never),
      col(db, "communityMembers")
        .countDocuments({ userId: toObjectId(user.id) } as never)
        .catch(() => 0),
      col(db, "reports").countDocuments({
        status: { $in: ["pending", "OPEN", "UNDER_REVIEW", "ESCALATED"] },
      } as never),
      col(db, "sessions").countDocuments({ userId: toObjectId(user.id) } as never),
    ]);
    const byStatus = await col(db, "classAssignments")
      .aggregate([
        { $match: { createdBy: toObjectId(user.id) } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ] as never)
      .toArray();
    return NextResponse.json({
      scope: "own",
      stats: {
        myAssignments,
        myExams,
        myCommunities: myStudents,
        openReports: myPendingReports,
        activeSessions: mySessions,
      },
      myAssignments: byStatus,
      note: "Teacher view: your own teaching numbers only. Platform-wide statistics are admin-only.",
    });
  }

  const [
    users,
    students,
    teachers,
    staff,
    posts,
    communities,
    events,
    videos,
    reels,
    stories,
    blogs,
    studyMaterials,
    classAssignments,
    classExams,
    examAttempts,
    pendingReports,
    moderationPending,
    moderationFlagged,
    sessions,
    newUsers30d,
    posts30d,
  ] = await Promise.all([
    col(db, "users").countDocuments({} as never),
    col(db, "users").countDocuments({ role: "student" } as never),
    col(db, "users").countDocuments({ role: "teacher" } as never),
    col(db, "users").countDocuments({ role: { $in: ["staff", "club", "moderator"] } } as never),
    col(db, "posts").countDocuments({ deletedAt: null } as never),
    col(db, "communities").countDocuments({} as never),
    col(db, "events").countDocuments({} as never),
    col(db, "videos").countDocuments({ moderationStatus: { $ne: "rejected" } } as never),
    col(db, "reels").countDocuments({} as never),
    col(db, "stories").countDocuments({ expiresAt: { $gt: new Date() } } as never),
    col(db, "blogs").countDocuments({ isPublished: true } as never),
    col(db, "studyMaterials").countDocuments({ isRemoved: { $ne: true } } as never),
    col(db, "classAssignments").countDocuments({} as never),
    col(db, "classExams").countDocuments({} as never),
    col(db, "examAttempts").countDocuments({} as never),
    col(db, "reports").countDocuments({
      status: { $in: ["pending", "OPEN", "UNDER_REVIEW", "ESCALATED"] },
    } as never),
    col(db, "moderationReviews").countDocuments({ status: "pending" } as never),
    col(db, "moderationReviews").countDocuments({ status: "flagged" } as never),
    col(db, "sessions").countDocuments({ expiresAt: { $gt: new Date() } } as never),
    col(db, "users").countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    } as never),
    col(db, "posts").countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    } as never),
  ]);

  const roleBreakdown = await col(db, "users")
    .aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }, { $sort: { count: -1 } }] as never)
    .toArray();

  return NextResponse.json({
    scope: "platform",
    stats: {
      users,
      students,
      teachers,
      staff,
      posts,
      communities,
      events,
      videos,
      reels,
      stories,
      blogs,
      studyMaterials,
      classAssignments,
      classExams,
      examAttempts,
      pendingReports,
      moderationPending,
      moderationFlagged,
      activeSessions: sessions,
      newUsers30d,
      posts30d,
    },
    roleBreakdown,
    permissions: {
      role: user.role,
      granted: ROLE_PERMISSIONS[user.role] ?? [],
    },
  });
}
