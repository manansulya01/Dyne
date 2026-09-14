import { Metadata } from "next";
import { EventsPageClient } from "./EventsPageClient";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Events - Dyne",
  description: "Discover and RSVP to campus events",
};

export default async function EventsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <EventsPageClient currentUserId={null} />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single();

  return <EventsPageClient currentUserId={profile?.id || null} />;
}