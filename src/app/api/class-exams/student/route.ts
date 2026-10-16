import { NextResponse } from "next/server";
import { col, type UserDoc } from "@/lib/mongo/collections";
import { toClassExamJSON, toExamAttemptJSON } from "@/lib/db/contracts";
import { toObjectId } from "@/lib/mongo/ids";
import { withUser, jsonError } from "@/lib/security/authorize";

/**
 * Student-facing exam list.
 *
 * Only published exams in the signed-in student's own class are returned, and
 * only that student's own attempts. Drafts, other classes and other students'
 * results are never visible here.
 */
export async function GET() {
  const auth = await withUser();
  if (!auth.ok) return auth.response;
  const { db, user } = auth.ctx;

  const me = await col<UserDoc>(db, "users")
    .findOne({ _id: toObjectId(user.id) } as never, {
      projection: { classGrade: 1, role: 1 },
    });
  const classGrade = me?.classGrade ?? null;
  if (!me || me.role !== "student" || !classGrade) {
    return jsonError(403, "Only students have class exams");
  }

  const exams = await col(db, "classExams")
    .find({ status: { $ne: "draft" }, classGrade } as never)
    .sort({ startsAt: -1, _id: -1 })
    .limit(50)
    .toArray();

  const examIds = exams.map((e) => (e as unknown as { _id: { toHexString(): string } })._id);
  const attemptRows = examIds.length
    ? await col(db, "examAttempts")
        .find({ examId: { $in: examIds }, studentId: toObjectId(user.id) } as never)
        .sort({ attemptNumber: -1 })
        .limit(200)
        .toArray()
    : [];

  const released = new Map(
    exams.map((e) => [
      (e as unknown as { _id: { toHexString(): string } })._id.toHexString(),
      Boolean((e as unknown as { resultsReleased?: boolean }).resultsReleased),
    ])
  );

  const attempts: Record<string, unknown[]> = {};
  for (const a of attemptRows) {
    const raw = a as unknown as { examId: { toHexString(): string } };
    const key = raw.examId.toHexString();
    // Scores stay hidden until the exam owner releases results.
    attempts[key] = [
      ...((attempts[key] ?? []) as unknown[]),
      toExamAttemptJSON(raw as Record<string, unknown>, { revealScores: released.get(key) === true }),
    ];
  }

  return NextResponse.json({
    exams: exams.map((e) => toClassExamJSON(e as unknown as Record<string, unknown>)),
    attempts,
  });
}
