import { getUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { DashboardClientLayout } from "./DashboardClientLayout";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  let profile = null;
  
  if (user) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return <DashboardClientLayout profile={profile}>{children}</DashboardClientLayout>;
}