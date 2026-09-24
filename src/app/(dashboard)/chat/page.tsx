import { Metadata } from "next";
import { ChatPageClient } from "./ChatPageClient";
import { getDb } from "@/lib/mongo/client";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Chat - Dyne",
  description: "Messages and conversations",
};

export default async function ChatPage() {
  const db = await getDb();
  const user = await getSessionUser(db);
  return <ChatPageClient currentUserId={user?.id || null} />;
}
