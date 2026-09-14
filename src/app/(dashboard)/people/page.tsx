import { Metadata } from "next";
import { PeoplePageClient } from "./PeoplePageClient";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "People - Dyne",
  description: "Discover people on Dyne",
};

export default async function PeoplePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <PeoplePageClient currentUserId={null} />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single();

  return <PeoplePageClient currentUserId={profile?.id || null} />;
}