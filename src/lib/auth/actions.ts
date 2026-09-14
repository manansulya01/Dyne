"use server";

import { createClient } from "@/lib/supabase/server";
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
  
  const { error } = await supabase.auth.signInWithPassword({
    email: validated.data.email,
    password: validated.data.password,
  });
  
  if (error) {
    return { error: { _form: [error.message] } };
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
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: authData.user.id,
        username: validated.data.username,
        display_name: validated.data.displayName,
        role: "student",
      });
    
    if (profileError) {
      if (profileError.code === "23505") {
        return { error: { username: ["Username is already taken"] } };
      }
      return { error: { _form: ["Failed to create profile. Please try again."] } };
    }

    const { data: studentRole } = await supabase
      .from("roles")
      .select("id")
      .eq("name", "student")
      .single();
    if (studentRole) {
      await supabase.from("user_roles").insert({
        user_id: authData.user.id,
        role_id: studentRole.id,
      });
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
  
  const { error } = await supabase.auth.resetPasswordForEmail(validated.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
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