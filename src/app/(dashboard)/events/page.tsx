import { Metadata } from "next";
import { EventsPageClient } from "./EventsPageClient";
import { getDb } from "@/lib/mongo/client";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Events - Dyne",
  description: "Discover and RSVP to campus events",
};

export default async function EventsPage() {
  const db = await getDb();
  const user = await getSessionUser(db);
  return <EventsPageClient currentUserId={user?.id || null} />;
}
