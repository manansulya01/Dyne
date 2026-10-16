import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { objectIdSchema } from "@/lib/mongo/ids";
import { getSessionUser } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { StudentReportClient } from "./StudentReportClient";

export const metadata: Metadata = {
  title: "Student report — Dyne",
  description: "Personalized academic and campus activity report.",
};

export const dynamic = "force-dynamic";

export default async function StudentReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Every authenticated role can read *its own* report; access to anyone else's
  // is decided server-side by the API.
  if (!hasPermission(user.role, "student_reports.read") && id !== user.id) {
    redirect("/reports/students");
  }
  if (!objectIdSchema.safeParse(id).success) notFound();
  return <StudentReportClient studentId={id} isSelf={id === user.id} />;
}
