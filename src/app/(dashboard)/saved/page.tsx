import type { Metadata } from "next";
import { SavedClient } from "./SavedClient";
import { getDb } from "@/lib/mongo/client";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Saved — Dyne",
  description: "Your bookmarked posts and study materials.",
};

export default async function SavedPage() {
  const db = await getDb();
  const user = await getSessionUser(db);
  return <SavedClient currentUserId={user?.id ?? null} />;
}
