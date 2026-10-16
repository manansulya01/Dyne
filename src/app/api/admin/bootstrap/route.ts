import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type UserDoc } from "@/lib/mongo/collections";
import { normalizeEmail } from "@/lib/db/users";
import { logAudit } from "@/lib/security/audit";
import { rateLimit, clientKey, RATE_PRESETS } from "@/lib/security/rateLimit";

/**
 * Secure one-time bootstrap for the first super_admin.
 * Requires ADMIN_BOOTSTRAP_SECRET env (never a default password).
 * - If any super_admin/admin already exists -> 403 (cannot silently recreate).
 * - Otherwise promotes an existing user (by email) or fails if not found.
 * - Every bootstrap is logged to auditLogs.
 */
const schema = z.object({
  email: z.string().email(),
  secret: z.string().min(8),
});

export async function POST(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  // Brute-force protection for the secret: attempts are strictly bounded.
  const rl = rateLimit(`admin-bootstrap:${clientKey(request)}`, RATE_PRESETS.login.limit, RATE_PRESETS.login.windowMs);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const validated = schema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const expected = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!expected || expected.length < 16) {
    return NextResponse.json({ error: "Bootstrap is not configured" }, { status: 403 });
  }
  // Constant-time comparison: a naive !== leaks the secret prefix length via
  // response timing. Lengths are compared first so timingSafeEqual never throws.
  const provided = validated.data.secret;
  const match =
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
  if (!match) {
    await logAudit(db, { action: "admin.bootstrap.failed", details: { email: validated.data.email } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await col<UserDoc>(db, "users").countDocuments({
    role: { $in: ["admin", "super_admin"] },
  } as never);
  if (existing > 0) {
    return NextResponse.json({ error: "Admin already exists" }, { status: 403 });
  }

  const user = await col<UserDoc>(db, "users").findOne({
    email: normalizeEmail(validated.data.email),
  } as never);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await col<UserDoc>(db, "users").updateOne(
    { _id: user._id } as never,
    { $set: { role: "super_admin", updatedAt: new Date() } }
  );
  await logAudit(db, {
    actorId: user._id.toHexString(),
    action: "admin.bootstrap",
    targetType: "user",
    targetId: user._id.toHexString(),
    details: { email: user.email },
  });
  return NextResponse.json({ success: true });
}

export async function GET() {
  const db = await getDb();
  await ensureIndexes(db);
  const count = await col<UserDoc>(db, "users").countDocuments({
    role: { $in: ["admin", "super_admin"] },
  } as never);
  return NextResponse.json({ bootstrapNeeded: count === 0 });
}
