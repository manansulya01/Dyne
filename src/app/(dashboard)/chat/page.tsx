import { Metadata } from "next";
import { ChatPageClient } from "./ChatPageClient";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Chat - Dyne",
  description: "Messages and conversations",
};

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <ChatPageClient currentUserId={null} />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single();

  return <ChatPageClient currentUserId={profile?.id || null} />;
}