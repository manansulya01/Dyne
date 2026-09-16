import { createAdminClient } from "@/lib/supabase/admin";

export type EnsureProfileResult =
  | { ok: true }
  | { ok: false; field?: string; message: string };

/**
 * Create the user's profile + default student role using the server-side
 * admin client (bypasses RLS by design — this module is server-only).
 *
 * This MUST use the admin client rather than the request-scoped client:
 * when email confirmation is enabled, signUp returns no session, so an
 * RLS-bound insert as the user would always fail. All inputs are validated
 * by callers (Zod) before reaching here; the role is hardcoded to student
 * and can never come from client input.
 *
 * Idempotent: safe to call on every signup/login. If the username belongs to
 * a different user, it reports a username conflict instead of overwriting.
 */
export async function ensureProfile(
  userId: string,
  username: string,
  displayName: string
): Promise<EnsureProfileResult> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id, username")
    .eq("id", userId)
    .single();

  if (!existing) {
    const { data: clash } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (clash) {
      return { ok: false, field: "username", message: "Username is already taken" };
    }

    const { error: insertError } = await admin.from("profiles").insert({
      id: userId,
      username,
      display_name: displayName,
      role: "student",
    });

    if (insertError) {
      if (insertError.code === "23505") {
        // Lost a race or retried signup: succeed only if the row is ours.
        const { data: mine } = await admin
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .single();
        if (mine) return { ok: true };
        return { ok: false, field: "username", message: "Username is already taken" };
      }
      return { ok: false, message: "Failed to create profile. Please try again." };
    }
  }

  const { data: studentRole } = await admin
    .from("roles")
    .select("id")
    .eq("name", "student")
    .single();

  if (studentRole) {
    const { error: roleError } = await admin.from("user_roles").insert({
      user_id: userId,
      role_id: studentRole.id,
    });
    // 23505 = mapping already exists; anything else is non-fatal here
    // (RLS + app checks treat profiles.role as the source for new users).
    if (roleError && roleError.code !== "23505") {
      return { ok: false, message: "Failed to assign default role. Please try again." };
    }
  }

  return { ok: true };
}

/**
 * Derive a safe fallback username from an email address for accounts whose
 * auth metadata lacks one (e.g. users created before profile backfill).
 */
export function fallbackUsername(email: string, userId: string): string {
  const base = (email.split("@")[0] || "user")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 20);
  return `${base || "user"}_${userId.slice(0, 4)}`;
}
