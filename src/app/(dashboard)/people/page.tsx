import { Metadata } from "next";
import { PeoplePageClient } from "./PeoplePageClient";
import { getDb } from "@/lib/mongo/client";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "People - Dyne",
  description: "Discover people on Dyne",
};

export default async function PeoplePage() {
  const db = await getDb();
  const user = await getSessionUser(db);
  return <PeoplePageClient currentUserId={user?.id || null} />;
}
