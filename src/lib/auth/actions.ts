"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureProfile, fallbackUsername } from "@/lib/auth/ensureProfile";
import { redirect } from "next/navigation";
import { loginSchema, signupSchema, resetPasswordSchema, updatePasswordSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

export async function loginAction(formData: FormData) {
  const supabase = await createClient();
  
  const validated = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  
  if (!validated.success) {
    return { error: validated.error.flatten().fieldErrors };
  }
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email: validated.data.email,
    password: validated.data.password,
  });

  if (error) {
    return { error: { _form: [error.message] } };
  }

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

  revalidatePath("/", "layout");
  redirect("/feed");
}

export async function signupAction(formData: FormData) {
  const supabase = await createClient();
  
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
    return { error: { _form: [authError.message] } };
  }
  
  if (authData.user) {
    const result = await ensureProfile(
      authData.user.id,
      validated.data.username,
      validated.data.displayName
    );

    if (!result.ok) {
      if (result.field === "username") {
        return { error: { username: [result.message] } };
      }
      return { error: { _form: [result.message] } };
    }
  }
  
  revalidatePath("/", "layout");
  redirect("/feed");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function resetPasswordAction(formData: FormData) {
  const supabase = await createClient();
  
  const validated = resetPasswordSchema.safeParse({
    email: formData.get("email"),
  });
  
  if (!validated.success) {
    return { error: validated.error.flatten().fieldErrors };
  }
  
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(validated.data.email, {
    redirectTo: `${siteUrl}/reset-password`,
  });
  
  if (error) {
    return { error: { _form: [error.message] } };
  }
  
  return { success: true };
}

export async function updatePasswordAction(formData: FormData) {
  const supabase = await createClient();
  
  const validated = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  
  if (!validated.success) {
    return { error: validated.error.flatten().fieldErrors };
  }
  
  const { error } = await supabase.auth.updateUser({
    password: validated.data.password,
  });
  
  if (error) {
    return { error: { _form: [error.message] } };
  }
  
  return { success: true };
}