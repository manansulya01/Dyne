import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { col, type UserDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import {
  getSessionUser,
  requireSessionUser,
  type SessionUser,
} from "@/lib/auth/session";

export { getSessionUser, requireSessionUser };
export type { SessionUser };

export async function getFullUser(userId: string) {
  const db = await getDb();
  return col<UserDoc>(db, "users").findOne({ _id: toObjectId(userId) } as never);
}

/** Page helper: redirect anonymous visitors to /login. */
export async function requireAuth(): Promise<SessionUser> {
  try {
    return await requireSessionUser();
  } catch {
    redirect("/login");
  }
}

/** Page helper: require a user record (always exists when signed up properly). */
export async function requireProfile() {
  const user = await requireAuth();
  const full = await getFullUser(user.id);
  if (!full) redirect("/login");
  return full;
}

export async function isAdmin(userId: string): Promise<boolean> {
  const full = await getFullUser(userId);
  return full?.role === "admin";
}

export async function getUserRoles(userId: string): Promise<string[]> {
  const full = await getFullUser(userId);
  return full ? [full.role] : [];
}
