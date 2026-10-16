import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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

/**
 * Delivery strategies.
 *
 * SECURITY RULE: a reset token is a bearer credential. It must only ever leave
 * the server over a channel the requester cannot read — an email inbox or a
 * webhook to the campus mail service. It is never returned from an API route,
 * never written to application logs, and never rendered in the admin UI.
 */
export type ResetDelivery = "webhook" | "file" | "none";

const RESET_FILE_DIR = path.join(process.cwd(), ".secure");

/** Sends the reset link to the configured campus mail webhook. */
export const webhookMailer: Mailer = {
  async sendPasswordReset(email: string, token: string): Promise<void> {
    const url = process.env.PASSWORD_RESET_WEBHOOK_URL;
    if (!url) throw new Error("PASSWORD_RESET_WEBHOOK_URL is not configured");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.PASSWORD_RESET_WEBHOOK_TOKEN
          ? { authorization: `Bearer ${process.env.PASSWORD_RESET_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        to: email,
        subject: "Dyne — password reset",
        resetUrl: buildResetUrl(token),
      }),
    });
    if (!res.ok) throw new Error(`password reset webhook failed (${res.status})`);
  },
};

/**
 * Campus deployments without SMTP: writes the one-time link to a file that only
 * the server operator can read (mode 0600). This is an out-of-band channel, not
 * an application response, so the token is still never exposed to a requester.
 */
export const fileMailer: Mailer = {
  async sendPasswordReset(email: string, token: string): Promise<void> {
    await mkdir(RESET_FILE_DIR, { recursive: true, mode: 0o700 });
    const file = path.join(RESET_FILE_DIR, `password-reset-${sha256Hex(email).slice(0, 16)}.txt`);
    const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
    const link = `${buildResetUrl(token)} (expires in ${Math.round(RESET_TTL_MS / 60000)} minutes)`;
    const body = `${existing}${link}\n`.trimStart();
    await writeFile(file, body, { encoding: "utf8", mode: 0o600 });
    await chmod(file, 0o600).catch(() => undefined);
  },
};

/**
 * No delivery channel configured. The token is generated and hashed but never
 * leaves the server, so the account cannot be recovered until a channel exists.
 */
export const noMailer: Mailer = {
  async sendPasswordReset(email: string): Promise<void> {
    console.warn(
      `[dyne] password reset generated for ${email} but no delivery channel is configured. ` +
        `Set PASSWORD_RESET_WEBHOOK_URL, or PASSWORD_RESET_DELIVERY=file for operator handover.`,
    );
  },
};

function buildResetUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/update-password?token=${encodeURIComponent(token)}`;
}

/**
 * Resolves the delivery channel from the environment.
 * `webhook` -> campus mail service, `file` -> operator handover file,
 * `none` -> no delivery (default in production).
 */
export function getPasswordResetMailer(): Mailer {
  const configured = (process.env.PASSWORD_RESET_DELIVERY ?? "").toLowerCase();
  const hasWebhook = Boolean(process.env.PASSWORD_RESET_WEBHOOK_URL);
  if (configured === "webhook" || (!configured && hasWebhook)) return webhookMailer;
  if (configured === "file") return fileMailer;
  if (configured === "none") return noMailer;
  return process.env.NODE_ENV === "production" ? noMailer : fileMailer;
}

/**
 * Issue a reset token (only the hash is stored) and hand the raw token to the
 * mailer. The raw token is deliberately NOT part of the return value so it can
 * never leak into an API response, a server action payload, or a UI notice.
 */
export async function issuePasswordReset(
  db: Db,
  userId: string | ObjectId,
  mailer: Mailer,
  email: string
): Promise<{ issued: true; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await col<PasswordResetDoc>(db, "passwordResets").insertOne({
    userId: toObjectId(userId),
    tokenHash: sha256Hex(token),
    expiresAt,
    usedAt: null,
    createdAt: new Date(),
  } as never);
  await mailer.sendPasswordReset(email, token);
  return { issued: true, expiresAt };
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
    {
      $set: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );
  await col<PasswordResetDoc>(db, "passwordResets").deleteOne({ _id: row._id } as never);
  await destroyAllUserSessions(db, row.userId);
  return { ok: true };
}
