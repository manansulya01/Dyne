import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { VideoUploadForm } from "./VideoUploadForm";

export const metadata: Metadata = {
  title: "Upload a video — Dyne",
  description: "Publish a horizontal campus video.",
};

export const dynamic = "force-dynamic";

export default async function VideoUploadPage() {
  const db = await getDb();
  const user = await getSessionUser(db);
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "videos.create")) redirect("/videos");
  return <VideoUploadForm />;
}
