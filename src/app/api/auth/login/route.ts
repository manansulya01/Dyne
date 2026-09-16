import { createClient } from "@/lib/supabase/server";
import { ensureProfile, fallbackUsername } from "@/lib/auth/ensureProfile";
import { loginSchema } from "@/lib/validation";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  
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
  
  const supabase = await createClient();
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email: validated.data.email,
    password: validated.data.password,
  });

  if (error) {
    return NextResponse.json(
      { error: { _form: [error.message] } },
      { status: 401 }
    );
  }

  // Backfill: accounts created before automatic profile creation (or via
  // dashboard) get their profile + student role on first login. Failures
  // here are non-fatal; protected routes surface a clear error instead.
  if (data.user) {
    const meta = (data.user.user_metadata || {}) as Record<string, unknown>;
    const username =
      typeof meta.username === "string" && meta.username.length >= 3
        ? meta.username
        : fallbackUsername(data.user.email || "user", data.user.id);
    const displayName =
      typeof meta.display_name === "string" && meta.display_name.length > 0
        ? meta.display_name
        : username;
    await ensureProfile(data.user.id, username, displayName);
  }

  return NextResponse.json({ success: true });
}