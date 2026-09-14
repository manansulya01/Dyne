import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SettingsPageClient } from "./SettingsPageClient";

export const metadata: Metadata = {
  title: "Settings — Dyne",
  description: "Manage your Dyne profile, account, and preferences.",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("*").eq("id", user.id).single()
    : { data: null };

  return (
    <SettingsPageClient
      profile={profile}
      email={user?.email ?? ""}
    />
  );
}
