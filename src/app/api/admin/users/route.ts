import { NextResponse } from "next/server";
import { z } from "zod";
import { col, type UserDoc } from "@/lib/mongo/collections";
import { setUserRole, suspendUser, unsuspendUser } from "@/lib/db/users";
import { toObjectId } from "@/lib/mongo/ids";
import { accountStatus, activeSessionCount } from "@/lib/db/adminUsers";
import { toProfileJSON } from "@/lib/db/contracts";
import { logAudit } from "@/lib/security/audit";
import { jsonError, withAnyPermission } from "@/lib/security/authorize";
import { parseLimitParam } from "@/lib/utils";
/**
 * Admin user directory.
 *
 * SECURITY: password material is NEVER selected or returned. The projection is
 * an explicit allow-list, so no credential field can leak even by accident.
 * Role changes, suspension and ban are gated by permissions and audited.
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
const ROLES = ["student", "teacher", "staff", "club", "moderator", "admin", "super_admin"] as const;
const roleUpdateSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  role: z.enum(ROLES),
});
const suspendSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  until: z.string().datetime(),
  reason: z.string().max(500).optional(),
});
const unsuspendSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/),
});
export async function GET(request: Request) {
  // The directory is an admin-tier view: `users.read` is a member-level
  // capability and must NOT open it.
  const auth = await withAnyPermission(["users.view", "users.manage"]);
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").trim().slice(0, 100);
  const role = searchParams.get("role");
  const classGrade = (searchParams.get("classGrade") || "").trim().slice(0, 50);
  const status = searchParams.get("status");
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 25, 50);
  const filter: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];
  if (search) {
    const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    // email is intentionally excluded from directory search.
    filter.$or = [{ username: rx }, { displayName: rx }];
  }
  if (role) {
    if (!(ROLES as readonly string[]).includes(role)) return jsonError(400, "Invalid role filter");
    filter.role = role;
  }
  if (classGrade) filter.classGrade = classGrade;
  if (status === "active") {
    and.push({ bannedAt: null });
    and.push({ $or: [{ suspendedUntil: null }, { suspendedUntil: { $lte: new Date() } }] });
  } else if (status === "suspended") {
    and.push({ suspendedUntil: { $gt: new Date() } });
  } else if (status === "banned") {
    and.push({ bannedAt: { $ne: null } });
  }
  const cursorDate = cursor ? new Date(cursor) : null;
  if (cursorDate && !isNaN(+cursorDate)) and.push({ createdAt: { $lt: cursorDate } });
  if (and.length > 0) filter.$and = and;
  const rows = await col<UserDoc>(db, "users")
    .find(filter as never)
    .project({ ...SAFE_FIELDS })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
  // Session counts for the loaded page only (bounded, never the whole table).
  const sessionCounts = await Promise.all(
    rows.map((r) => activeSessionCount(db, r._id))
  );
  const total = await col<UserDoc>(db, "users").countDocuments(filter as never);
  return NextResponse.json({
    users: rows.map((r, i) => ({
      ...toProfileJSON(r as unknown as Record<string, unknown>),
      account_status: accountStatus(r as unknown as UserDoc),
      suspended_until: r.suspendedUntil ?? null,
      banned_at: r.bannedAt ?? null,
      ban_reason: r.banReason ?? null,
      must_change_password: Boolean(r.mustChangePassword),
      active_sessions: sessionCounts[i],
    })),
    total,
    hasMore: rows.length === limit,
    cursor: rows.length > 0 ? String(rows[rows.length - 1].createdAt) : null,
    // Explicit guarantee, documented for clients and reviewers.
    password_fields_exposed: false,
    // Only a super-admin may grant/revoke admin or super_admin.
    canAssignRoles: user.role === "super_admin",
  });
}
/** Assign a role. Server-side only; client-supplied roles are never trusted. */
export async function PATCH(request: Request) {
  const auth = await withAnyPermission(["users.manage"]);
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const body = await request.json().catch(() => null);
  const validated = roleUpdateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const { userId, role } = validated.data;
  // Admins cannot demote themselves (prevents last-admin lockout).
  if (userId === user.id && role !== user.role) {
    return jsonError(400, "Admins cannot change their own role");
  }
  // Privilege escalation guard: only super_admin may grant admin/super_admin.
  if ((role === "admin" || role === "super_admin") && user.role !== "super_admin") {
    await logAudit(db, {
      actorId: user.id,
      action: "admin.role.escalation_blocked",
      targetType: "user",
      targetId: userId,
      details: { attemptedRole: role },
    });
    return jsonError(403, "Forbidden");
  }
  const target = await col<UserDoc>(db, "users").findOne({
    _id: toObjectId(userId),
  } as never);
  if (!target) return jsonError(404, "User not found");
  // Cannot modify another super_admin unless the caller is super_admin.
  if (target.role === "super_admin" && user.role !== "super_admin") {
    return jsonError(403, "Forbidden");
  }
  const prevRole = target.role;
  const updated = await setUserRole(db, userId, role);
  if (!updated) return jsonError(404, "User not found");
  await logAudit(db, {
    actorId: user.id,
    action: "admin.role.change",
    targetType: "user",
    targetId: userId,
    details: { from: prevRole, to: role },
  });
  return NextResponse.json({ success: true });
}
/** Suspend (temporarily) a user. Revokes their sessions immediately. */
export async function POST(request: Request) {
  const auth = await withAnyPermission(["users.suspend"]);
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const body = await request.json().catch(() => null);
  const validated = suspendSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  if (validated.data.userId === user.id) return jsonError(400, "You cannot suspend yourself");
  const until = new Date(validated.data.until);
  if (isNaN(until.getTime()) || until.getTime() <= Date.now()) {
    return jsonError(400, "Suspension end must be in the future");
  }
  const updated = await suspendUser(db, validated.data.userId, until);
  if (!updated) return jsonError(404, "User not found");
  // Kill live sessions so the suspension takes effect immediately.
  await col(db, "sessions").deleteMany({
    userId: toObjectId(validated.data.userId),
  } as never);
  await logAudit(db, {
    actorId: user.id,
    action: "admin.user.suspend",
    targetType: "user",
    targetId: validated.data.userId,
    details: { until: until.toISOString(), reason: validated.data.reason ?? null },
  });
  return NextResponse.json({ success: true });
}
/** Lift a suspension. */
export async function DELETE(request: Request) {
  const auth = await withAnyPermission(["users.restore"]);
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;
  const body = await request.json().catch(() => null);
  const validated = unsuspendSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }
  const updated = await unsuspendUser(db, validated.data.userId);
  if (!updated) return jsonError(404, "User not found");
  await logAudit(db, {
    actorId: user.id,
    action: "admin.user.unsuspend",
    targetType: "user",
    targetId: validated.data.userId,
  });
  return NextResponse.json({ success: true });
}