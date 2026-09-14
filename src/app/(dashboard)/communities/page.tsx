import { Metadata } from "next";
import { CommunitiesPageClient } from "./CommunitiesPageClient";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Communities - Dyne",
  description: "Discover and join communities on Dyne",
};

export default async function CommunitiesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <CommunitiesPageClient currentUserId={null} />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single();

  return <CommunitiesPageClient currentUserId={profile?.id || null} />;
}