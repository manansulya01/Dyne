import type { Metadata } from "next";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { requireProfile } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { listTeacherAssignments, getSubmission } from "@/lib/db/teacherAssignments";

interface SubmissionView {
  status: string;
  progress: number;
  submitted_at: string | null;
  submission_text: string | null;
  score: number | null;
  feedback: string | null;
}
import { ClassAssignmentsClient } from "./ClassAssignmentsClient";

export const metadata: Metadata = {
  title: "Class work — Dyne",
  description: "Assignments published for your class.",
};

export const dynamic = "force-dynamic";

export default async function ClassAssignmentsPage() {
  const db = await getDb();
  await ensureIndexes(db);
  const profile = await requireProfile();

  // Students see published work for their own class. Teachers/admins get the
  // full list (their monitoring view lives at /teacher/assignments).
  const isTeacher = hasPermission(profile.role as never, "assignments.monitor" as never);
  const rows = await listTeacherAssignments(db, {
    classGrade: isTeacher ? undefined : (profile.classGrade ?? undefined),
    status: isTeacher ? undefined : "published",
    limit: 50,
  }).catch(() => []);

  const assignments = rows.map((r) => {
    const raw = r as unknown as Record<string, unknown>;
    return {
      id: String(raw.id ?? ""),
      title: String(raw.title ?? ""),
      description: (raw.description ?? null) as string | null,
      subject: String(raw.subject ?? ""),
      class_grade: String(raw.classGrade ?? ""),
      status: String(raw.status ?? "published"),
      due_date: (raw.dueDate ?? null) as string | null,
      max_marks: (raw.maxMarks ?? null) as number | null,
      created_at: String(raw.createdAt ?? ""),
    };
  });

  const submissions: Record<string, SubmissionView> = {};
  if (!isTeacher) {
    for (const a of assignments) {
      const sub = await getSubmission(db, a.id, profile._id).catch(() => null);
      if (!sub) continue;
      const raw = sub as unknown as Record<string, unknown>;
      submissions[a.id] = {
        status: String(raw.status ?? "not_started"),
        progress: Number(raw.progress ?? 0),
        submitted_at: (raw.submittedAt ?? null) as string | null,
        submission_text: (raw.submissionText ?? null) as string | null,
        score: (raw.score ?? null) as number | null,
        feedback: (raw.feedback ?? null) as string | null,
      };
    }
  }

  return <ClassAssignmentsClient initialAssignments={assignments} initialSubmissions={submissions} />;
}
