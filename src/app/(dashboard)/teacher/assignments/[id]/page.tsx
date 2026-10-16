import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { objectIdSchema } from "@/lib/mongo/ids";
import { getSessionUser } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { AssignmentMonitorClient } from "./AssignmentMonitorClient";

export const metadata: Metadata = {
  title: "Assignment monitor — Dyne",
  description: "See who completed a class assignment and who did not.",
};

export const dynamic = "force-dynamic";

export default async function AssignmentMonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Server gate: monitoring requires an explicit permission.
  if (!hasPermission(user.role, "assignments.monitor")) redirect("/dashboard");
  if (!objectIdSchema.safeParse(id).success) notFound();

  return (
    <AssignmentMonitorClient assignmentId={id} canGrade={hasPermission(user.role, "assignments.manage")} />
  );
}
