"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { loginSchema, signupSchema, resetPasswordSchema, updatePasswordSchema } from "@/lib/validation";
import { findUserByEmail } from "@/lib/db/users";
import { createUser } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/password";
import { consoleMailer, issuePasswordReset } from "@/lib/auth/passwordReset";
import { setPasswordHash } from "@/lib/db/users";
import {
  createSession,
  destroyAllUserSessions,
  destroySession,
  requireSessionUser,
  SESSION_COOKIE,
  sessionCookieOptions,
  clearedSessionCookieOptions,
} from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

export async function loginAction(formData: FormData) {
  const validated = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { error: validated.error.flatten().fieldErrors };
  }

  const db = await getDb();
  await ensureIndexes(db);

  const user = await findUserByEmail(db, validated.data.email);
  const ok = user
    ? await verifyPassword(validated.data.password, user.passwordHash)
    : false;

  if (!user || !ok) {
    return { error: { _form: ["Invalid email or password"] } };
  }

  if (user.suspendedUntil && user.suspendedUntil.getTime() > Date.now()) {
    return { error: { _form: ["This account is suspended. Contact an administrator."] } };
  }

  const { token, expiresAt } = await createSession(db, user._id);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { ...sessionCookieOptions(), expires: expiresAt });

  revalidatePath("/", "layout");
  redirect("/feed");
}

export async function signupAction(formData: FormData) {
  const validated = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    username: formData.get("username"),
    displayName: formData.get("displayName"),
  });

  if (!validated.success) {
    return { error: validated.error.flatten().fieldErrors };
  }

  const db = await getDb();
  await ensureIndexes(db);

  // Profiles are created inline below (single writer, no extra hop).
  const created = await createUser(db, {
    email: validated.data.email,
    password: validated.data.password,
    username: validated.data.username,
    displayName: validated.data.displayName,
  });

  if (!created.ok) {
    if (created.reason === "username_taken") {
      return { error: { username: ["Username is already taken"] } };
    }
    return { error: { email: ["An account with this email already exists"] } };
  }

  const { token, expiresAt } = await createSession(db, created.userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { ...sessionCookieOptions(), expires: expiresAt });

  revalidatePath("/", "layout");
  redirect("/feed");
}

export async function logoutAction() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await destroySession(db, token);
  }
  store.set(SESSION_COOKIE, "", clearedSessionCookieOptions());
  redirect("/login");
}

export async function resetPasswordAction(formData: FormData) {
  const validated = resetPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!validated.success) {
    return { error: validated.error.flatten().fieldErrors };
  }

  const db = await getDb();
  const user = await findUserByEmail(db, validated.data.email);
  if (user) {
    await issuePasswordReset(db, user._id, consoleMailer, user.email);
  }

  return { success: true };
}

export async function updatePasswordAction(formData: FormData) {
  const validated = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!validated.success) {
    return { error: validated.error.flatten().fieldErrors };
  }

  const db = await getDb();
  let userId: string;
  try {
    userId = (await requireSessionUser(db)).id;
  } catch {
    return { error: { _form: ["You must be signed in"] } };
  }

  await setPasswordHash(db, userId, validated.data.password);
  await destroyAllUserSessions(db, new ObjectId(userId));
  const { token, expiresAt } = await createSession(db, new ObjectId(userId));
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { ...sessionCookieOptions(), expires: expiresAt });

  return { success: true };
}
