import { Metadata } from "next";
import { Suspense } from "react";
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
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground" role="status">Loading chats…</p>}>
      <ChatPageClient currentUserId={user?.id || null} />
    </Suspense>
  );
}
