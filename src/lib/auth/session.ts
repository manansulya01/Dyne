import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { Db, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongo/client";
import { col, type UserDoc } from "@/lib/mongo/collections";
import { isProduction } from "@/lib/mongo/env";

export const SESSION_COOKIE = "dyne_session";
/** 30 days, in seconds. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: UserDoc["role"];
}

function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Create a session row + signed token. Only the sha256 hash is stored. */
export async function createSession(
  db: Db,
  userId: ObjectId,
  userAgent?: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await col(db, "sessions").insertOne({
    userId,
    tokenHash: sha256Hex(token),
    createdAt: new Date(),
    expiresAt,
    ...(userAgent ? { userAgent } : {}),
  } as never);
  return { token, expiresAt };
}

export async function destroySession(db: Db, token: string): Promise<void> {
  await col(db, "sessions").deleteOne({ tokenHash: sha256Hex(token) } as never);
}

export async function destroyAllUserSessions(db: Db, userId: ObjectId): Promise<void> {
  await col(db, "sessions").deleteMany({ userId } as never);
}

async function findSessionUser(db: Db, token: string): Promise<SessionUser | null> {
  const resolved = await resolveUserByToken(db, token);
  return resolved;
}

/** Resolve a raw session token to its user (exported for tests; routes should use getSessionUser). */
export async function resolveUserByToken(db: Db, token: string): Promise<SessionUser | null> {
  if (!token || token.length < 16) return null;
  // Indexed unique lookup on the token hash (only the hash is ever stored).
  const match = await col(db, "sessions").findOne({
    tokenHash: sha256Hex(token),
    expiresAt: { $gt: new Date() },
  } as never);
  if (!match) return null;
  const user = await col<UserDoc>(db, "users").findOne({ _id: match.userId } as never);
  if (!user) return null;
  // Suspended accounts lose API access immediately, even with a live session.
  if (user.suspendedUntil && user.suspendedUntil.getTime() > Date.now()) return null;
  return {
    id: user._id.toHexString(),
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
  };
}

/** Resolve the current request's user from the HTTP-only session cookie. */
export async function getSessionUser(db?: Db): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const database = db ?? (await getDb());
  return findSessionUser(database, token);
}

/** Require an authenticated user; throws a 401-coded error otherwise. */
export async function requireSessionUser(db?: Db): Promise<SessionUser> {
  const user = await getSessionUser(db);
  if (!user) {
    const err = new Error("Unauthorized") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return user;
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(),
    path: "/",
    maxAge,
  };
}

export function clearedSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(),
    path: "/",
    maxAge: 0,
  };
}

/** JSON-safe error mapping for API routes. */
export function toHttpError(err: unknown): { status: number; message: string } {
  if (err && typeof err === "object" && "status" in err) {
    const status = Number((err as { status: unknown }).status);
    if (Number.isInteger(status) && status >= 400 && status < 600) {
      return { status, message: status === 401 ? "Unauthorized" : "Forbidden" };
    }
  }
  return { status: 500, message: "Internal server error" };
}
