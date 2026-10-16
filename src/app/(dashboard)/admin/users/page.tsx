import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type UserDoc } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { accountStatus, activeSessionCount } from "@/lib/db/adminUsers";
import { toProfileJSON } from "@/lib/db/contracts";
import { AdminUsersClient } from "./AdminUsersClient";

export const metadata: Metadata = {
  title: "Users — Dyne Admin",
  description: "Admin user management.",
};

export const dynamic = "force-dynamic";

/** Explicit allow-list: no password field is ever selected. */
const SAFE_FIELDS = {
  _id: 1, username: 1, displayName: 1, avatarUrl: 1, role: 1, classGrade: 1,
  house: 1, createdAt: 1, updatedAt: 1, suspendedUntil: 1, bannedAt: 1,
  banReason: 1, mustChangePassword: 1, emailVerifiedAt: 1,
} as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; status?: string }>;
}) {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "users.manage") && !hasPermission(user.role, "users.view")) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const filter: Record<string, unknown> = {};
  if (sp.role) filter.role = sp.role;
  if (sp.status === "banned") filter.bannedAt = { $ne: null };
  else if (sp.status === "suspended") filter.suspendedUntil = { $gt: new Date() };
  else if (sp.status === "active") {
    filter.bannedAt = null;
    filter.$and = [{ $or: [{ suspendedUntil: null }, { suspendedUntil: { $lte: new Date() } }] }];
  }

  const rows = await col<UserDoc>(db, "users")
    .find(filter as never)
    .project({ ...SAFE_FIELDS })
    .sort({ createdAt: -1, _id: -1 })
    .limit(25)
    .toArray();
  const total = await col<UserDoc>(db, "users").countDocuments(filter as never);
  const sessionCounts = await Promise.all(rows.map((r) => activeSessionCount(db, r._id)));

  return (
    <AdminUsersClient
      currentRole={user.role}
      canAssignRoles={user.role === "super_admin"}
      initialTotal={total}
      initialHasMore={rows.length === 25}
      initialUsers={rows.map((r, i) => ({
        ...toProfileJSON(r as unknown as Record<string, unknown>),
        created_at: r.createdAt ? new Date(r.createdAt).toISOString() : "",
        account_status: accountStatus(r as unknown as UserDoc),
        suspended_until: r.suspendedUntil ? r.suspendedUntil.toISOString() : null,
        banned_at: r.bannedAt ? r.bannedAt.toISOString() : null,
        must_change_password: Boolean(r.mustChangePassword),
        active_sessions: sessionCounts[i],
      }))}
    />
  );
}
