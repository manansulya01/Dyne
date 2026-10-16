import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type UserDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { hasPermission } from "@/lib/permissions";
import { getPasswordResetMailer, issuePasswordReset } from "@/lib/auth/passwordReset";import { destroyAllUserSessions } from "@/lib/auth/session";
import { setPasswordHash } from "@/lib/db/users";
import { logAudit } from "@/lib/security/audit";
import { guardRate, jsonError, withAnyPermission } from "@/lib/security/authorize";
import { createNotification } from "@/lib/db/notifications";

/**
 * Admin account actions on a user.
 *
 * PASSWORD SECURITY (non-negotiable):
 *   - No endpoint anywhere returns a password, a password hash, or a reset
 *     token. There is deliberately no "read password" action.
 *   - `force_password_reset` issues a single-use reset link and delivers it over
 *     an out-of-band channel (mail webhook, or an operator-only handover file).
 *     The token is never returned by this route, never logged, never rendered in
 *     the UI, and never stored in plaintext — only its sha256 hash is persisted.
 *   - `set_password` accepts a NEW password chosen by the admin for an
 *     emergency; it is hashed immediately and the plaintext is discarded.
 *
 * Every action is permission-gated server-side and audited.
 */

const ROLES = ["student", "teacher", "staff", "club", "moderator", "admin", "super_admin"] as const;

const actionSchema = z.object({
  userId: objectIdSchema,
  action: z.enum([
    "suspend",
    "unsuspend",
    "ban",
    "unban",
    "revoke_sessions",
    "force_password_reset",
    "set_password",
    "change_role",
    "mark_password_change_required",
  ]),
  // Suspend
  until: z.string().datetime().optional(),
  reason: z.string().trim().min(3).max(500).optional(),
  // set_password
  newPassword: z.string().min(8).max(200).optional(),
  // change_role
  role: z.enum(ROLES).optional(),
});

export async function POST(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  const auth = await withAnyPermission([
    "users.suspend",
    "users.ban",
    "users.restore",
    "users.revoke_sessions",
    "users.reset_password",
    "users.manage",
  ]);
  if (!auth.ok) return auth.response;
  const { user: admin } = auth.ctx;

  const limited = guardRate(request, admin.id, "academicWrites");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const validated = actionSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const { userId, action } = validated.data;

  // Self-targeting guard for the most dangerous operations.
  if (userId === admin.id && ["suspend", "ban", "revoke_sessions", "change_role"].includes(action)) {
    return jsonError(400, "You cannot perform this action on your own account");
  }

  const target = await col<UserDoc>(db, "users").findOne({ _id: toObjectId(userId) } as never);
  if (!target) return jsonError(404, "User not found");

  const targetIsSuper = target.role === "super_admin";
  if (targetIsSuper && admin.role !== "super_admin") {
    return jsonError(403, "Forbidden");
  }

  switch (action) {
    case "suspend": {
      if (!hasPermission(admin.role, "users.suspend")) return jsonError(403, "Forbidden");
      const until = validated.data.until ? new Date(validated.data.until) : null;
      if (!until || isNaN(until.getTime()) || until.getTime() <= Date.now()) {
        return jsonError(400, "Suspension end must be a future datetime");
      }
      await col<UserDoc>(db, "users").updateOne(
        { _id: target._id } as never,
        { $set: { suspendedUntil: until, updatedAt: new Date() } }
      );
      await destroyAllUserSessions(db, target._id);
      await audit(db, admin.id, "admin.user.suspend", userId, {
        until: until.toISOString(),
        reason: validated.data.reason ?? null,
      });
      await createNotification(db, {
        recipientId: target._id,
        type: "moderation_action",
        title: "Account suspended",
        message: "Your account has been suspended. Contact an administrator.",
        data: { until: until.toISOString() },
      });
      return NextResponse.json({ success: true });
    }

    case "unsuspend": {
      if (!hasPermission(admin.role, "users.restore")) return jsonError(403, "Forbidden");
      await col<UserDoc>(db, "users").updateOne(
        { _id: target._id } as never,
        { $set: { suspendedUntil: null, updatedAt: new Date() } }
      );
      await audit(db, admin.id, "admin.user.unsuspend", userId, {
        reason: validated.data.reason ?? null,
      });
      return NextResponse.json({ success: true });
    }

    case "ban": {
      if (!hasPermission(admin.role, "users.ban")) return jsonError(403, "Forbidden");
      if (!validated.data.reason) return jsonError(400, "A ban reason is required");
      await col<UserDoc>(db, "users").updateOne(
        { _id: target._id } as never,
        {
          $set: {
            bannedAt: new Date(),
            banReason: validated.data.reason.slice(0, 500),
            suspendedUntil: null,
            updatedAt: new Date(),
          },
        }
      );
      await destroyAllUserSessions(db, target._id);
      await audit(db, admin.id, "admin.user.ban", userId, { reason: validated.data.reason });
      return NextResponse.json({ success: true });
    }

    case "unban": {
      if (!hasPermission(admin.role, "users.unban")) return jsonError(403, "Forbidden");
      await col<UserDoc>(db, "users").updateOne(
        { _id: target._id } as never,
        { $set: { bannedAt: null, banReason: null, suspendedUntil: null, updatedAt: new Date() } }
      );
      await audit(db, admin.id, "admin.user.unban", userId, {
        reason: validated.data.reason ?? null,
      });
      return NextResponse.json({ success: true });
    }

    case "revoke_sessions": {
      if (!hasPermission(admin.role, "users.revoke_sessions")) return jsonError(403, "Forbidden");
      const removed = await destroyAllUserSessions(db, target._id);
      await audit(db, admin.id, "admin.user.revoke_sessions", userId, { removed: removed ?? 0 });
      return NextResponse.json({ success: true, removedSessions: removed ?? 0 });
    }

    case "force_password_reset": {
      if (!hasPermission(admin.role, "users.reset_password")) return jsonError(403, "Forbidden");

      // A one-time token is generated server-side; only its sha256 hash is
      // stored. The raw token goes straight to the configured delivery channel
      // (campus mail webhook, or an operator-only handover file) and is NEVER
      // part of this HTTP response.
      const issued = await issuePasswordReset(db, target._id, getPasswordResetMailer(), target.email);
      // Force rotation on next login, and revoke existing sessions.
      await col<UserDoc>(db, "users").updateOne(
        { _id: target._id } as never,
        { $set: { mustChangePassword: true, updatedAt: new Date() } }
      );
      await destroyAllUserSessions(db, target._id);
      await audit(db, admin.id, "admin.user.force_password_reset", userId, {
        expiresAt: issued.expiresAt.toISOString(),
      });
      return NextResponse.json({
        success: true,
        expiresAt: issued.expiresAt.toISOString(),
        delivery: process.env.PASSWORD_RESET_DELIVERY ?? (process.env.PASSWORD_RESET_WEBHOOK_URL ? "webhook" : "file"),
        note: "A single-use reset link was sent to the user's registered email address. All sessions were revoked; the user must set a new password before signing in again.",
      });
    }

    case "set_password": {
      if (!hasPermission(admin.role, "users.reset_password")) return jsonError(403, "Forbidden");
      const newPassword = validated.data.newPassword;
      if (!newPassword || newPassword.length < 8) {
        return jsonError(400, "Password must be at least 8 characters");
      }
      // Hashed immediately; the plaintext is never stored or returned.
      await setPasswordHash(db, target._id, newPassword);
      await col<UserDoc>(db, "users").updateOne(
        { _id: target._id } as never,
        { $set: { mustChangePassword: true, passwordUpdatedAt: new Date(), updatedAt: new Date() } }
      );
      await destroyAllUserSessions(db, target._id);
      // Audit records the ACTION only — never the password.
      await audit(db, admin.id, "admin.user.set_password", userId, {
        reason: validated.data.reason ?? null,
      });
      return NextResponse.json({ success: true });
    }

    case "mark_password_change_required": {
      if (!hasPermission(admin.role, "users.reset_password")) return jsonError(403, "Forbidden");
      await col<UserDoc>(db, "users").updateOne(
        { _id: target._id } as never,
        { $set: { mustChangePassword: true, updatedAt: new Date() } }
      );
      await audit(db, admin.id, "admin.user.require_password_change", userId, {
        reason: validated.data.reason ?? null,
      });
      return NextResponse.json({ success: true });
    }

    case "change_role": {
      if (!hasPermission(admin.role, "users.manage")) return jsonError(403, "Forbidden");
      const role = validated.data.role;
      if (!role) return jsonError(400, "A role is required");
      if ((role === "admin" || role === "super_admin") && admin.role !== "super_admin") {
        await audit(db, admin.id, "admin.role.escalation_blocked", userId, { attemptedRole: role });
        return jsonError(403, "Forbidden");
      }
      await col<UserDoc>(db, "users").updateOne(
        { _id: target._id } as never,
        { $set: { role, updatedAt: new Date() } }
      );
      await audit(db, admin.id, "admin.role.change", userId, { from: target.role, to: role });
      return NextResponse.json({ success: true });
    }

    default:
      return jsonError(400, "Unsupported action");
  }
}

async function audit(
  db: Awaited<ReturnType<typeof getDb>>,
  actorId: string,
  action: string,
  targetId: string,
  details: Record<string, unknown>
) {
  await logAudit(db, { actorId, action, targetType: "user", targetId, details });
}
