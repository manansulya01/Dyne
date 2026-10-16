import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { requireSessionUser, toHttpError, type SessionUser } from "@/lib/auth/session";
import { requirePermission, type Permission } from "@/lib/permissions";
import type { Db } from "mongodb";

/** Admin gate shared by admin routes. Never trust client-supplied roles. */
export async function requireAdminUser(db: Db): Promise<SessionUser> {
  const user = await requireSessionUser(db);
  if (user.role !== "admin" && user.role !== "super_admin") {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return user;
}

/** Granular gate: any role holding `permission` (moderators included where mapped). */
export async function requirePermUser(db: Db, permission: Permission): Promise<SessionUser> {
  const user = await requireSessionUser(db);
  requirePermission(user.role, permission);
  return user;
}

export async function GET() {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireAdminUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const [users, posts, pendingReports, events, communities, videos] = await Promise.all([
    col(db, "users").countDocuments({}),
    col(db, "posts").countDocuments({ deletedAt: null } as never),
    col(db, "reports").countDocuments({ status: { $in: ["pending", "OPEN", "UNDER_REVIEW", "ESCALATED"] } } as never),
    col(db, "events").countDocuments({}),
    col(db, "communities").countDocuments({}),
    col(db, "videos").countDocuments({}),
  ]);

  return NextResponse.json({
    stats: { users, posts, pendingReports, events, communities, videos },
  });
}
