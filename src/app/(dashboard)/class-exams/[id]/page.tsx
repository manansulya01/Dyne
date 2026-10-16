import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { objectIdSchema } from "@/lib/mongo/ids";
import { requireProfile } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { ExamRunnerClient } from "./ExamRunnerClient";

export const metadata: Metadata = {
  title: "Class exam — Dyne",
  description: "Take a class exam.",
};

export const dynamic = "force-dynamic";

export default async function ClassExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  if (!objectIdSchema.safeParse(id).success) notFound();
  // Teachers/admins use the builder; students use the runner.
  if (hasPermission(profile.role as never, "exams.manage" as never)) {
    redirect(`/teacher/exams/${id}`);
  }
  if (profile.role !== "student") redirect("/class-exams");
  return <ExamRunnerClient examId={id} />;
}
