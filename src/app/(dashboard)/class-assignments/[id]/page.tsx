import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { requireProfile } from "@/lib/auth/server";
import { getTeacherAssignment } from "@/lib/db/teacherAssignments";
import { toTeacherAssignmentJSON } from "@/lib/db/contracts";
import { ClassAssignmentDetail } from "./ClassAssignmentDetail";

export const metadata: Metadata = {
  title: "Assignment — Dyne",
  description: "Class assignment details and submission.",
};

export const dynamic = "force-dynamic";

export default async function ClassAssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) notFound();

  const db = await getDb();
  await ensureIndexes(db);
  const profile = await requireProfile();

  const assignment = await getTeacherAssignment(db, id);
  if (!assignment) notFound();
  const raw = assignment as unknown as Record<string, unknown>;
  const json = toTeacherAssignmentJSON(raw);

  // Drafts are never visible to students.
  if (json.status === "draft" && profile.role === "student") notFound();
  if (profile.role === "student" && json.class_grade !== (profile.classGrade ?? "")) notFound();

  return (
    <ClassAssignmentDetail
      assignment={json}
      isStudent={profile.role === "student"}
      canManage={
        profile.role === "admin" ||
        profile.role === "super_admin" ||
        String((raw.createdBy as { toHexString(): string })?.toHexString?.() ?? "") === String(profile._id)
      }
    />
  );
}
