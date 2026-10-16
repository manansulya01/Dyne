import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { loginSchema } from "@/lib/validation";
import { findUserByEmail } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/password";
import { readFormData } from "@/lib/utils";
import { rateLimit, clientKey, RATE_PRESETS } from "@/lib/security/rateLimit";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";

export async function POST(request: Request) {
  const rl = rateLimit(`login:${clientKey(request)}`, RATE_PRESETS.login.limit, RATE_PRESETS.login.windowMs);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }
  const formData = await readFormData(request);
  if (!formData) {
    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  }

  const validated = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = await getDb();
  await ensureIndexes(db);

  // Same generic error for unknown email vs wrong password (no enumeration).
  const user = await findUserByEmail(db, validated.data.email);
  const ok = user
    ? await verifyPassword(validated.data.password, user.passwordHash)
    : false;

  if (!user || !ok) {
    return NextResponse.json(
      { error: { _form: ["Invalid email or password"] } },
      { status: 401 }
    );
  }

  if (user.suspendedUntil && user.suspendedUntil.getTime() > Date.now()) {
    return NextResponse.json(
      { error: { _form: ["This account is suspended. Contact an administrator."] } },
      { status: 403 }
    );
  }
  if (user.bannedAt) {
    return NextResponse.json(
      { error: { _form: ["This account is suspended. Contact an administrator."] } },
      { status: 403 }
    );
  }

  const { token, expiresAt } = await createSession(
    db,
    user._id,
    request.headers.get("user-agent") ?? undefined
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    ...sessionCookieOptions(),
    expires: expiresAt,
  });

  // Flagged accounts (bootstrap, forced reset, admin-set password) may sign in
  // but MUST rotate their password before using the product. The session is
  // additionally restricted to the password-change route until they do.
  if (user.mustChangePassword) {
    return NextResponse.json({
      success: true,
      mustChangePassword: true,
      redirectTo: "/update-password?reason=forced",
    });
  }

  return NextResponse.json({ success: true });
}
