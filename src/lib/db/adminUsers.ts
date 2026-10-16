import type { Db } from "mongodb";
import { col, type UserDoc, type SessionDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { toProfileJSON } from "@/lib/db/contracts";

/**
 * Admin user directory.
 *
 * SECURITY: this route (and every admin user route) NEVER returns
 * `passwordHash`, `password`, or any credential material. The projection below
 * is an explicit allow-list rather than an exclusion list, so a future field
 * cannot leak by accident.
 */

const SAFE_FIELDS = {
  _id: 1,
  username: 1,
  displayName: 1,
  avatarUrl: 1,
  role: 1,
  classGrade: 1,
  house: 1,
  createdAt: 1,
  updatedAt: 1,
  suspendedUntil: 1,
  bannedAt: 1,
  banReason: 1,
  mustChangePassword: 1,
  emailVerifiedAt: 1,
} as const;

export function accountStatus(u: UserDoc): "active" | "suspended" | "banned" {
  if (u.bannedAt) return "banned";
  if (u.suspendedUntil && u.suspendedUntil.getTime() > Date.now()) return "suspended";
  return "active";
}

/** Live sessions for a user (used by the admin user detail + revoke action). */
export async function activeSessionCount(db: Db, userId: string | { toHexString(): string }) {
  const id = typeof userId === "string" ? userId : userId.toHexString();
  return col<SessionDoc>(db, "sessions").countDocuments({
    userId: toObjectId(id),
    expiresAt: { $gt: new Date() },
  } as never);
}

/** One user's admin-visible detail. Same allow-list projection (no secrets). */
export async function adminUserDetail(db: Db, id: string) {
  const user = await col<UserDoc>(db, "users").findOne({ _id: toObjectId(id) } as never, {
    projection: { ...SAFE_FIELDS },
  });
  if (!user) return null;

  const oid = user._id;
  const [sessions, reportsFiled, reportsAgainst, moderationActions, auditTrail, assignmentCount, examCount] =
    await Promise.all([
      activeSessionCount(db, oid),
      col(db, "reports").countDocuments({ reporterId: oid } as never),
      col(db, "reports").countDocuments({ targetType: "user", targetId: oid } as never),
      col(db, "moderationActions").countDocuments({ targetType: "user", targetId: oid } as never),
      col(db, "auditLogs")
        .find({ $or: [{ actorId: oid }, { targetId: oid }] } as never)
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
      col(db, "classAssignments").countDocuments({ createdBy: oid } as never),
      col(db, "classExams").countDocuments({ createdBy: oid } as never),
    ]);

  const posts = await col(db, "posts").countDocuments({ authorId: oid, deletedAt: null } as never);
  const comments = await col(db, "comments").countDocuments({ authorId: oid, deletedAt: null } as never);
  const communityMemberships = await col(db, "communityMembers").countDocuments({ userId: oid } as never);

  return {
    user: {
      ...toProfileJSON(user as unknown as Record<string, unknown>),
      account_status: accountStatus(user),
      suspended_until: user.suspendedUntil ?? null,
      banned_at: user.bannedAt ?? null,
      ban_reason: user.banReason ?? null,
      must_change_password: Boolean(user.mustChangePassword),
    },
    summary: {
      posts,
      comments,
      communityMemberships,
      reportsFiled,
      reportsAgainst,
      moderationActions,
      activeSessions: sessions,
      classAssignments: assignmentCount,
      classExams: examCount,
    },
    audit: auditTrail.map((a) => ({
      id: a._id.toHexString(),
      action: a.action,
      targetType: a.targetType ?? null,
      targetId: a.targetId ? a.targetId.toHexString() : null,
      details: a.details ?? null,
      createdAt: a.createdAt,
    })),
    // No password material of any kind is included.
    password_fields_exposed: false,
  };
}
