import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureProfile } from "@/lib/auth/ensureProfile";
import { signupSchema } from "@/lib/validation";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  
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
  
  const supabase = await createClient();
  
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: validated.data.email,
    password: validated.data.password,
    options: {
      data: {
        username: validated.data.username,
        display_name: validated.data.displayName,
      },
    },
  });
  
  if (authError) {
    return NextResponse.json(
      { error: { _form: [authError.message] } },
      { status: 400 }
    );
  }
  
  if (authData.user) {
    // Guard against GoTrue's account-enumeration protection: signing up with
    // an already-registered email returns an obfuscated placeholder user that
    // does NOT exist in auth.users. Creating a profile for it would violate
    // the profiles.id foreign key, so verify first.
    const admin = createAdminClient();
    const { data: realUser, error: lookupError } = await admin.auth.admin.getUserById(
      authData.user.id
    );
    if (lookupError || !realUser?.user) {
      return NextResponse.json(
        { error: { _form: ["User already registered. Try logging in instead."] } },
        { status: 400 }
      );
    }

    // Server-side profile creation (admin client): works whether or not
    // email confirmation returned a session. Role is hardcoded student.
    const result = await ensureProfile(
      authData.user.id,
      validated.data.username,
      validated.data.displayName
    );

    if (!result.ok) {
      if (result.field) {
        return NextResponse.json(
          { error: { [result.field]: [result.message] } },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: { _form: [result.message] } },
        { status: 500 }
      );
    }
  }
  
  return NextResponse.json({ success: true });
}