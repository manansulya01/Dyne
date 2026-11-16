import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { getSessionUser } from "@/lib/auth/session";
import { YouTubeLibraryClient } from "./YouTubeLibraryClient";

export const metadata: Metadata = {
  title: "YouTube Library | Dyne Watch",
  description: "Teacher-curated YouTube videos for the Dyne campus community.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function YouTubeLibraryPage() {
  const db = await getDb();
  const user = await getSessionUser(db);
  if (!user) redirect("/login");
  return <YouTubeLibraryClient role={user.role} />;
}
