import type { Db } from "mongodb";
import { col, type UserDoc, type UserRole } from "@/lib/mongo/collections";
import { hashPassword } from "@/lib/auth/password";
import { normalizeEmail } from "@/lib/db/users";
import { logAudit } from "@/lib/security/audit";

/**
 * Environment-driven first-administrator provisioning.
 *
 * Security properties (all deliberate):
 *   - The initial admin's password is read from the environment ONLY. It is
 *     never committed, never seeded into a source file, never returned by an
 *     API, and never logged.
 *   - Only a bcrypt hash is persisted.
 *   - Provisioning is idempotent and refuses to touch an existing admin.
 *   - A provisioned admin is flagged `mustChangePassword` so the product can
 *     force a rotation on first login.
 *   - Provisioning can be disabled entirely by unsetting the env variables.
 */

export interface BootstrapAdminEnv {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

/** Read bootstrap credentials from the environment. Returns null when unset. */
export function readBootstrapAdminEnv(
  env: NodeJS.ProcessEnv = process.env
): BootstrapAdminEnv | null {
  const username = env.ADMIN_BOOTSTRAP_USERNAME?.trim();
  const email = env.ADMIN_BOOTSTRAP_EMAIL?.trim();
  const password = env.ADMIN_BOOTSTRAP_PASSWORD ?? "";
  if (!username || !email || !password) return null;
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return null;
  if (!email.includes("@")) return null;
  // A weak bootstrap password is refused outright rather than provisioned.
  if (password.length < 8) return null;
  return {
    username,
    email: normalizeEmail(email),
    password,
    displayName: env.ADMIN_BOOTSTRAP_DISPLAY_NAME?.trim() || username,
  };
}

/** True when the environment carries usable bootstrap credentials. */
export function isBootstrapConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readBootstrapAdminEnv(env) !== null;
}

export interface ProvisionResult {
  status: "provisioned" | "existing_admin" | "disabled" | "invalid_env" | "username_taken";
  userId?: string;
  username?: string;
  role?: UserRole;
}

/**
 * Provision the initial administrator from environment credentials.
 *
 * Refuses when ANY admin already exists (never silently re-creates or
 * re-promotes). Safe to call on every boot.
 */
export async function provisionInitialAdmin(
  db: Db,
  env: NodeJS.ProcessEnv = process.env
): Promise<ProvisionResult> {
  const config = readBootstrapAdminEnv(env);
  if (!config) {
    const configured =
      !!env.ADMIN_BOOTSTRAP_USERNAME || !!env.ADMIN_BOOTSTRAP_EMAIL || !!env.ADMIN_BOOTSTRAP_PASSWORD;
    return { status: configured ? "invalid_env" : "disabled" };
  }

  const existingAdmins = await col<UserDoc>(db, "users").countDocuments({
    role: { $in: ["admin", "super_admin"] },
  } as never);
  if (existingAdmins > 0) {
    return { status: "existing_admin" };
  }

  const email = normalizeEmail(config.email);
  const existing = await col<UserDoc>(db, "users").findOne({
    $or: [{ email }, { username: config.username }],
  } as never);
  if (existing) {
    // Never take over an existing account silently: an operator must use the
    // audited /api/admin/bootstrap flow instead.
    return { status: "username_taken", username: config.username };
  }

  const now = new Date();
  const passwordHash = await hashPassword(config.password);
  const res = await col<UserDoc>(db, "users").insertOne({
    email,
    passwordHash,
    username: config.username,
    displayName: config.displayName ?? config.username,
    avatarUrl: null,
    coverImageUrl: null,
    accent: null,
    bio: null,
    role: "super_admin",
    classGrade: null,
    house: null,
    interests: [],
    profileTags: [],
    emailVerifiedAt: null,
    suspendedUntil: null,
    bannedAt: null,
    banReason: null,
    mustChangePassword: true,
    passwordUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  } as never);

  // Audit records the identity and mechanism, never the credential.
  await logAudit(db, {
    actorId: res.insertedId.toHexString(),
    action: "admin.provision.initial",
    targetType: "user",
    targetId: res.insertedId.toHexString(),
    details: { username: config.username, source: "env", mustChangePassword: true },
  });

  return {
    status: "provisioned",
    userId: res.insertedId.toHexString(),
    username: config.username,
    role: "super_admin",
  };
}

/**
 * Best-effort provisioning hook invoked before privileged route work.
 * Never throws: a database or environment problem must not take the app down.
 */
export async function ensureInitialAdmin(db: Db): Promise<void> {
  try {
    if (!isBootstrapConfigured()) return;
    await provisionInitialAdmin(db);
  } catch {
    /* provisioning is a convenience; explicit bootstrap endpoint still exists */
  }
}
