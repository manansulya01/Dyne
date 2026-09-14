import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getProfile(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  
  if (error) return null;
  return data;
}

export async function requireAuth() {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireProfile() {
  const user = await requireAuth();
  const profile = await getProfile(user.id);
  if (!profile) {
    redirect("/onboarding");
  }
  return profile;
}

export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_roles")
    .select("role:roles!inner(name)")
    .eq("user_id", userId)
    .eq("roles.name", "admin");
  
  return (data?.length ?? 0) > 0;
}

export async function getUserRoles(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_roles")
    .select("role:roles!inner(name)")
    .eq("user_id", userId);
  
  return (data as Array<{ role: { name: string } }> | null)?.map(d => d.role?.name).filter(Boolean) as string[] || [];
}