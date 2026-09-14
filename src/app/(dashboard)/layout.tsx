import { getUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardClientLayout } from "./DashboardClientLayout";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return <DashboardClientLayout profile={data}>{children}</DashboardClientLayout>;
}