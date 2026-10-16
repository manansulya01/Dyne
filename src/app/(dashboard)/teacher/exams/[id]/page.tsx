import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { objectIdSchema } from "@/lib/mongo/ids";
import { getSessionUser } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { ExamBuilderClient } from "./ExamBuilderClient";

export const metadata: Metadata = {
  title: "Exam builder — Dyne",
  description: "Build questions, publish, and grade a class exam.",
};

export const dynamic = "force-dynamic";

export default async function ExamBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Server gate: exam authoring requires an explicit permission.
  if (!hasPermission(user.role, "exams.manage")) redirect("/dashboard");
  if (!objectIdSchema.safeParse(id).success) notFound();
  return <ExamBuilderClient examId={id} />;
}
