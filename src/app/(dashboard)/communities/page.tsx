import { Metadata } from "next";
import { CommunitiesPageClient } from "./CommunitiesPageClient";
import { getDb } from "@/lib/mongo/client";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Communities - Dyne",
  description: "Discover and join communities on Dyne",
};

export default async function CommunitiesPage() {
  const db = await getDb();
  const user = await getSessionUser(db);
  return <CommunitiesPageClient currentUserId={user?.id || null} />;
}
