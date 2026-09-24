import { createHash, randomBytes } from "node:crypto";
import { Db, ObjectId } from "mongodb";
import { col, type PasswordResetDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { hashPassword } from "@/lib/auth/password";
import { destroyAllUserSessions } from "@/lib/auth/session";

export const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export interface Mailer {
  sendPasswordReset(email: string, token: string): Promise<void>;
}

/** Development mailer: logs the token server-side. Production MUST configure a real provider. */
export const consoleMailer: Mailer = {
  async sendPasswordReset(email: string, token: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[dyne] password reset for ${email}: token=${token} (dev mailer — configure a real provider in production)`);
  },
};

/** Issue a reset token (only the hash is stored). Always call the mailer. */
export async function issuePasswordReset(
  db: Db,
  userId: string | ObjectId,
  mailer: Mailer,
  email: string
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await col<PasswordResetDoc>(db, "passwordResets").insertOne({
    userId: toObjectId(userId),
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
    usedAt: null,
    createdAt: new Date(),
  } as never);
  await mailer.sendPasswordReset(email, token);
}

/**
 * Consume a reset token: validates, sets the new password, marks used, and
 * revokes all sessions. Single-use by construction (usedAt check + delete).
 */
export async function consumePasswordReset(
  db: Db,
  token: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "expired" | "used" | "weak" }> {
  if (newPassword.length < 8) return { ok: false, reason: "weak" };
  const row = await col<PasswordResetDoc>(db, "passwordResets").findOne({
    tokenHash: sha256Hex(token),
  } as never);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  await col(db, "users").updateOne(
    { _id: row.userId } as never,
    { $set: { passwordHash: await hashPassword(newPassword), updatedAt: new Date() } }
  );
  await col<PasswordResetDoc>(db, "passwordResets").deleteOne({ _id: row._id } as never);
  await destroyAllUserSessions(db, row.userId);
  return { ok: true };
}
