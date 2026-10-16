import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongo/client";
import { updatePasswordSchema } from "@/lib/validation";
import { setPasswordHash } from "@/lib/db/users";
import { readFormData } from "@/lib/utils";
import { rateLimit, clientKey, RATE_PRESETS } from "@/lib/security/rateLimit";
import {
  createSession,
  destroyAllUserSessions,
  requireSessionUser,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";

/**
 * Change the logged-in user's password. Rotates all sessions and issues a
 * fresh one so the user stays signed in on this device only.
 */
export async function POST(request: Request) {
  const rl = rateLimit(`update-password:${clientKey(request)}`, RATE_PRESETS.passwordReset.limit, RATE_PRESETS.passwordReset.windowMs);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const formData = await readFormData(request);
  if (!formData) {
    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  }

  const validated = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = await getDb();
  let user;
  try {
    user = await requireSessionUser(db);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setPasswordHash(db, user.id, validated.data.password);
  await destroyAllUserSessions(db, new ObjectId(user.id));
  const { token, expiresAt } = await createSession(
    db,
    new ObjectId(user.id),
    request.headers.get("user-agent") ?? undefined
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    ...sessionCookieOptions(),
    expires: expiresAt,
  });

  return NextResponse.json({ success: true });
}
