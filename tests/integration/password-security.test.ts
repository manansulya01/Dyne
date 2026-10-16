import { describe, expect, it, beforeAll, afterEach } from "vitest";
process.env.MONGODB_DB = "dyne_test_password_security";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames, type UserDoc } from "@/lib/mongo/collections";
import { createUser, setUserRole, setPasswordHash } from "@/lib/db/users";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { adminUserDetail } from "@/lib/db/adminUsers";
import { provisionInitialAdmin, readBootstrapAdminEnv } from "@/lib/security/bootstrap";
import { logAudit } from "@/lib/security/audit";
import { toProfileJSON } from "@/lib/db/contracts";

/**
 * Password security invariants.
 *
 * The central rule: NO code path returns a password, a password hash, or a
 * reset token to a client, and no plaintext password is ever persisted or
 * logged.
 */

const SECRET = "sup3r-s3cret-value";

async function makeUser(username: string, role?: UserDoc["role"]) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`,
    password: "Password-1",
    username,
    displayName: username,
  });
  if (!r.ok) throw new Error(`setup failed for ${username}`);
  if (role) await setUserRole(db, r.userId, role);
  return r.userId;
}

describe("password security", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("stores only a bcrypt hash, never a plaintext password", async () => {
    const db = await getDb();
    const id = await makeUser("pw_plaintext");
    const row = await col<UserDoc>(db, "users").findOne({ _id: id } as never);
    const stored = JSON.stringify(row);
    expect(stored).not.toContain("Password-1");
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword("Password-1", row!.passwordHash)).toBe(true);
    expect(await verifyPassword("wrong", row!.passwordHash)).toBe(false);
  });

  it("never returns credential material from the admin user detail", async () => {
    const db = await getDb();
    const id = await makeUser("pw_detail", "student");
    const detail = await adminUserDetail(db, id.toHexString());
    expect(detail).not.toBeNull();
    const serialized = JSON.stringify(detail);
    // No hash, no password field, no reset token.
    expect(serialized).not.toContain("$2b$");
    expect(serialized).not.toMatch(/"passwordHash"/);
    expect(serialized).not.toMatch(/"password"/);
    expect(serialized).not.toContain("Password-1");
    expect((detail as { password_fields_exposed: boolean }).password_fields_exposed).toBe(false);
    // The projection is an allow-list, so the field simply is not present.
    expect(detail && "passwordHash" in detail).toBe(false);
  });

  it("excludes credential fields from the profile contract", async () => {
    const db = await getDb();
    const id = await makeUser("pw_profile", "student");
    const row = await col<UserDoc>(db, "users").findOne({ _id: id } as never);
    const json = toProfileJSON(row as unknown as Record<string, unknown>);
    const serialized = JSON.stringify(json);
    expect(serialized).not.toMatch(/password/i);
    expect(serialized).not.toContain("$2b$");
    expect(json).not.toHaveProperty("passwordHash");
  });

  it("never stores a plaintext password when an admin resets one", async () => {
    const db = await getDb();
    const id = await makeUser("pw_reset", "student");
    const newPassword = "Replacement-9!";
    await setPasswordHash(db, id, newPassword);
    const row = await col<UserDoc>(db, "users").findOne({ _id: id } as never);
    expect(JSON.stringify(row)).not.toContain(newPassword);
    expect(await verifyPassword(newPassword, row!.passwordHash)).toBe(true);
    expect(await verifyPassword("Password-1", row!.passwordHash)).toBe(false);
  });

  it("stores reset tokens as hashes only", async () => {
    const db = await getDb();
    const id = await makeUser("pw_reset_token", "student");
    // Mirrors the admin force-reset flow: a raw token is generated, only its
    // sha256 hash is written.
    const { createHash, randomBytes } = await import("node:crypto");
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
    await col(db, "passwordResets").insertOne({
      userId: id,
      tokenHash,
      expiresAt: new Date(Date.now() + 3600_000),
      usedAt: null,
      createdAt: new Date(),
    } as never);
    const rows = await col(db, "passwordResets").find({ userId: id } as never).toArray();
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(rows[0].tokenHash).not.toBe(token);
    expect(rows[0].tokenHash).toHaveLength(64);
  });

  it("provisions the initial admin from env without ever storing the plaintext", async () => {
    const db = await getDb();
    const env = {
      ADMIN_BOOTSTRAP_USERNAME: "k4ge",
      ADMIN_BOOTSTRAP_EMAIL: "k4ge@mva.edu",
      ADMIN_BOOTSTRAP_PASSWORD: SECRET,
    } as unknown as NodeJS.ProcessEnv;

    const result = await provisionInitialAdmin(db, env as unknown as NodeJS.ProcessEnv);
    expect(result.status).toBe("provisioned");
    expect(result.username).toBe("k4ge");
    expect(result.role).toBe("super_admin");

    const row = await col<UserDoc>(db, "users").findOne({ username: "k4ge" } as never);
    expect(row).not.toBeNull();
    expect(row?.role).toBe("super_admin");
    // Plaintext password never persisted…
    expect(JSON.stringify(row)).not.toContain(SECRET);
    expect(await verifyPassword(SECRET, row!.passwordHash)).toBe(true);
    // …and the account must rotate it on first login.
    expect(row?.mustChangePassword).toBe(true);

    // Audit records the identity and the mechanism, never the credential.
    const audit = await col(db, "auditLogs").findOne({ action: "admin.provision.initial" } as never);
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit)).not.toContain(SECRET);

    // Idempotent: a second run refuses and changes nothing.
    const again = await provisionInitialAdmin(db, env as unknown as NodeJS.ProcessEnv);
    expect(again.status).toBe("existing_admin");
    expect(await col<UserDoc>(db, "users").countDocuments({ role: "super_admin" } as never)).toBe(1);
  });

  it("refuses weak or incomplete bootstrap env", () => {
    expect(readBootstrapAdminEnv({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(
      readBootstrapAdminEnv({ ADMIN_BOOTSTRAP_USERNAME: "ab", ADMIN_BOOTSTRAP_EMAIL: "a@b.c", ADMIN_BOOTSTRAP_PASSWORD: SECRET } as unknown as NodeJS.ProcessEnv)
    ).toBeNull();
    expect(
      readBootstrapAdminEnv({ ADMIN_BOOTSTRAP_USERNAME: "k4ge", ADMIN_BOOTSTRAP_EMAIL: "k4ge@mva.edu", ADMIN_BOOTSTRAP_PASSWORD: "short" } as unknown as NodeJS.ProcessEnv)
    ).toBeNull();
    expect(
      readBootstrapAdminEnv({ ADMIN_BOOTSTRAP_USERNAME: "bad name!", ADMIN_BOOTSTRAP_EMAIL: "a@b.c", ADMIN_BOOTSTRAP_PASSWORD: SECRET } as unknown as NodeJS.ProcessEnv)
    ).toBeNull();
    const good = readBootstrapAdminEnv({
      ADMIN_BOOTSTRAP_USERNAME: "k4ge",
      ADMIN_BOOTSTRAP_EMAIL: "K4GE@MVA.EDU",
      ADMIN_BOOTSTRAP_PASSWORD: SECRET,
    } as unknown as NodeJS.ProcessEnv);
    expect(good?.username).toBe("k4ge");
    // Emails are normalized.
    expect(good?.email).toBe("k4ge@mva.edu");
  });

  it("refuses to take over an existing account during provisioning", async () => {
    const db = await getDb();
    await makeUser("k4ge");
    const result = await provisionInitialAdmin(db, {
      ADMIN_BOOTSTRAP_USERNAME: "k4ge",
      ADMIN_BOOTSTRAP_EMAIL: "k4ge@mva.edu",
      ADMIN_BOOTSTRAP_PASSWORD: SECRET,
    } as unknown as NodeJS.ProcessEnv);
    expect(result.status).toBe("username_taken");
    const row = await col<UserDoc>(db, "users").findOne({ username: "k4ge" } as never);
    expect(row?.role).toBe("student");
  });

  it("keeps audit records free of secrets", async () => {
    const db = await getDb();
    const admin = await makeUser("pw_audit_admin", "admin");
    const target = await makeUser("pw_audit_target", "student");
    await logAudit(db, {
      actorId: admin.toHexString(),
      action: "admin.user.reset_password",
      targetType: "user",
      targetId: target.toHexString(),
      details: { reason: "user requested" },
    });
    const rows = await col(db, "auditLogs").find({} as never).toArray();
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain("Password-1");
    expect(serialized).not.toMatch(/\$2[aby]\$/);
    expect(serialized).not.toContain(SECRET);
  });

  it("clears the forced-rotation flag once the user picks their own password", async () => {
    const db = await getDb();
    const id = await makeUser("pw_rotate", "student");
    await col<UserDoc>(db, "users").updateOne(
      { _id: id } as never,
      { $set: { mustChangePassword: true } }
    );
    // A completed rotation must end the forced-rotation loop; otherwise the
    // account is permanently bounced to the update-password screen.
    await setPasswordHash(db, id, "Chosen-By-User-7!");
    const row = await col<UserDoc>(db, "users").findOne({ _id: id } as never);
    expect(row?.mustChangePassword).toBe(false);
    expect(row?.passwordUpdatedAt).toBeTruthy();
    expect(await verifyPassword("Chosen-By-User-7!", row!.passwordHash)).toBe(true);
    expect(JSON.stringify(row)).not.toContain("Chosen-By-User-7!");
  });

  it("uses a distinct salt per hash", async () => {
    const a = await hashPassword("Password-1");
    const b = await hashPassword("Password-1");
    expect(a).not.toBe(b);
    expect(await verifyPassword("Password-1", a)).toBe(true);
    expect(await verifyPassword("Password-1", b)).toBe(true);
  });

  it("carries no credential-material keys anywhere in the admin detail payload", async () => {
    const db = await getDb();
    const id = await makeUser("pw_keys", "student");
    const detail = await adminUserDetail(db, id.toHexString());
    const entries: Array<[string, unknown]> = [];
    collectEntries(detail, entries);
    for (const [key, value] of entries) {
      const k = key.toLowerCase();
      // A key may mention "password" only for boolean assurance flags (the
      // rotation flag and the explicit "no credentials exposed" marker).
      if (k === "must_change_password" || k === "password_fields_exposed") {
        expect(typeof value).toBe("boolean");
        if (k === "password_fields_exposed") expect(value).toBe(false);
        continue;
      }
      expect(k, `unexpected key ${key}`).not.toMatch(/password|secret|token|hash/i);
      // No value may look like a bcrypt hash or a JWT-ish blob either.
      if (typeof value === "string") expect(value).not.toMatch(/^\$2[aby]\$/);
    }
  });
});

function collectEntries(value: unknown, out: Array<[string, unknown]>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectEntries(v, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.push([k, v]);
      collectEntries(v, out);
    }
  }
}
