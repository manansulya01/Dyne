import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { ReelUploadForm } from "./ReelUploadForm";

export const metadata: Metadata = {
  title: "Upload a reel — Dyne",
  description: "Publish a vertical campus reel.",
};

export const dynamic = "force-dynamic";

export default async function ReelUploadPage() {
  const db = await getDb();
  const user = await getSessionUser(db);
  if (!user) redirect("/login");
  // Server-side gate: the page is unreachable without the permission (and the
  // API enforces it again independently).
  if (!hasPermission(user.role, "reels.create")) redirect("/reels");
  return <ReelUploadForm />;
}
