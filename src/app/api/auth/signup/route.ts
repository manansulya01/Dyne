import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { signupSchema } from "@/lib/validation";
import { createUser } from "@/lib/db/users";
import { readFormData } from "@/lib/utils";
import { rateLimit, clientKey, RATE_PRESETS } from "@/lib/security/rateLimit";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";

export async function POST(request: Request) {
  const rl = rateLimit(`signup:${clientKey(request)}`, RATE_PRESETS.signup.limit, RATE_PRESETS.signup.windowMs);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const formData = await readFormData(request);
  if (!formData) {
    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  }

  const validated = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    username: formData.get("username"),
    displayName: formData.get("displayName"),
  });

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = await getDb().catch(() =>
    null
  );
  if (!db) {
    return NextResponse.json(
      {
        error: {
          _form: [
            "Service temporarily unavailable. The database is unreachable — check MongoDB status and try again.",
          ],
        },
      },
      { status: 503 }
    );
  }
  try {
    await ensureIndexes(db);
  } catch {
    return NextResponse.json(
      {
        error: {
          _form: [
            "Service temporarily unavailable. The database is unreachable — check MongoDB status and try again.",
          ],
        },
      },
      { status: 503 }
    );
  }

  try {
    const created = await createUser(db, {
      email: validated.data.email,
      password: validated.data.password,
      username: validated.data.username,
      displayName: validated.data.displayName,
    });

    if (!created.ok) {
      if (created.reason === "username_taken") {
        return NextResponse.json(
          { error: { username: ["Username is already taken"] } },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: { email: ["An account with this email already exists"] } },
        { status: 400 }
      );
    }

    const { token, expiresAt } = await createSession(
      db,
      created.userId,
      request.headers.get("user-agent") ?? undefined
    );
    const store = await cookies();
    store.set(SESSION_COOKIE, token, {
      ...sessionCookieOptions(),
      expires: expiresAt,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/MongoDB unavailable/i.test(message)) {
      return NextResponse.json(
        {
          error: {
            _form: [
              "Service temporarily unavailable. The database is unreachable — check MongoDB status and try again.",
            ],
          },
        },
        { status: 503 }
      );
    }
    throw err;
  }
}
