import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { loginSchema } from "@/lib/validation";
import { findUserByLoginIdentifier } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/password";
import { readFormData } from "@/lib/utils";
import { rateLimit, clientKey, RATE_PRESETS } from "@/lib/security/rateLimit";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";

type StaffPortal = "teacher" | "admin";

export async function POST(request: Request) {
  const rl = rateLimit(`login:${clientKey(request)}`, RATE_PRESETS.login.limit, RATE_PRESETS.login.windowMs);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }
  const formData = await readFormData(request);
  if (!formData) {
    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  }

  const portalValue = formData.get("portal");
  if (portalValue !== null && portalValue !== "" && portalValue !== "teacher" && portalValue !== "admin") {
    return NextResponse.json({ error: "Invalid sign-in portal." }, { status: 400 });
  }
  const portal = portalValue === "teacher" || portalValue === "admin"
    ? portalValue as StaffPortal
    : null;

  const validated = loginSchema.safeParse({
    identifier: formData.get("identifier") ?? formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
    await ensureIndexes(db);
  } catch {
    return NextResponse.json(
      { error: { _form: ["Sign-in is temporarily unavailable because the account database cannot be reached. Please try again shortly."] } },
      { status: 503 }
    );
  }

  // Same generic error for unknown account vs wrong password (no enumeration).
  const user = await findUserByLoginIdentifier(db, validated.data.identifier);
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

  // Staff portals are only entry points, never privilege grants. Check the
  // canonical role in MongoDB before creating a session or setting a cookie.
  if (portal === "teacher" && user.role !== "teacher") {
    return NextResponse.json(
      { error: { _form: ["This account is not authorized for the teacher portal."] } },
      { status: 403 }
    );
  }
  if (portal === "admin" && user.role !== "admin" && user.role !== "super_admin") {
    return NextResponse.json(
      { error: { _form: ["This account is not authorized for the administration portal."] } },
      { status: 403 }
    );
  }

  let token: string;
  let expiresAt: Date;
  try {
    const session = await createSession(db, user._id, request.headers.get("user-agent") ?? undefined);
    token = session.token;
    expiresAt = session.expiresAt;
  } catch {
    return NextResponse.json(
      { error: { _form: ["Your account was verified, but a session could not be created. Please try again shortly."] } },
      { status: 503 }
    );
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    ...sessionCookieOptions(),
    expires: expiresAt,
  });

  // Flagged accounts must rotate their password before accessing any portal.
  if (user.mustChangePassword) {
    return NextResponse.json({
      success: true,
      mustChangePassword: true,
      redirectTo: "/update-password?reason=forced",
    });
  }

  return NextResponse.json({
    success: true,
    redirectTo: portal === "admin" ? "/admin" : portal === "teacher" ? "/feed" : "/feed",
  });
}
