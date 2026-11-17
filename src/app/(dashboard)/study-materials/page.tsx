import type { Metadata } from "next";
import { StudyMaterialsClient } from "./StudyMaterialsClient";
import { requireAuth } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Study Materials — Dyne",
  description: "Browse and share campus study materials.",
};

export default async function StudyMaterialsPage() {
  const user = await requireAuth();
  return <StudyMaterialsClient cacheScope={user.id} />;
}
