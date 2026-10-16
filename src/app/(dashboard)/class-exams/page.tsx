import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { requireProfile } from "@/lib/auth/server";
import { toClassExamJSON } from "@/lib/db/contracts";
import { ClassExamsClient } from "./ClassExamsClient";

export const metadata: Metadata = {
  title: "Class exams — Dyne",
  description: "Exams published for your class.",
};

export const dynamic = "force-dynamic";

export default async function ClassExamsPage() {
  const db = await getDb();
  await ensureIndexes(db);
  const profile = await requireProfile();
  if (profile.role !== "student") redirect("/teacher/exams");

  const rows = profile.classGrade
    ? await col(db, "classExams")
        .find({ status: { $ne: "draft" }, classGrade: profile.classGrade } as never)
        .sort({ startsAt: -1, _id: -1 })
        .limit(50)
        .toArray()
    : [];

  return <ClassExamsClient initialExams={rows.map((r) => toClassExamJSON(r as unknown as Record<string, unknown>))} />;
}
