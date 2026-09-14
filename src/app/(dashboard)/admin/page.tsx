import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminPageClient } from "./AdminPageClient";

export const metadata: Metadata = {
  title: "Admin — Dyne",
  description: "Dyne administration dashboard.",
};

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role:roles!inner(name)")
    .eq("user_id", user.id)
    .eq("roles.name", "admin");

  if (!roles || roles.length === 0) redirect("/feed");

  return <AdminPageClient />;
}
