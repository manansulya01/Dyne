import { describe, expect, it, beforeAll, afterEach } from "vitest";
process.env.MONGODB_DB = "dyne_test_assignments_exams";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames, type UserDoc } from "@/lib/mongo/collections";
import { createUser, setUserRole } from "@/lib/db/users";
import {
  assignmentMonitor,
  canManageAssignment,
  createTeacherAssignment,
  deleteTeacherAssignment,
  getSubmission,
  gradeSubmission,
  listTeacherAssignments,
  refreshAssignmentCounts,
  studentsInScope,
  submitAssignment,
  updateTeacherAssignment,
} from "@/lib/db/teacherAssignments";
import {
  canManageExam,
  createExam,
  deleteExam,
  examResults,
  getAttempt,
  gradeAttempt,
  publishExam,
  releaseResults,
  replaceQuestions,
  startAttempt,
  studentAttempts,
  submitAttempt,
  updateExam,
} from "@/lib/db/classExams";
import { isAutoGradable } from "@/lib/db/classExams";
import { toExamAttemptJSON } from "@/lib/db/contracts";
import type { ExamQuestion } from "@/lib/mongo/collections";
import { ObjectId } from "mongodb";

/**
 * Teacher assignments (including the uncompleted-student list) and the exam
 * builder (question types, attempts, grading, results, permissions).
 */

async function makeUser(
  username: string,
  role?: UserDoc["role"],
  classGrade: string | null = null
) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`,
    password: "Password-1",
    username,
    displayName: username,
  });
  if (!r.ok) throw new Error(`setup failed for ${username}`);
  if (role) await setUserRole(db, r.userId, role);
  if (classGrade) {
    await col<UserDoc>(db, "users").updateOne(
      { _id: r.userId } as never,
      { $set: { classGrade } }
    );
  }
  return r.userId;
}

describe("teacher assignments", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("creates, publishes and lists assignments for the owner's class only", async () => {
    const db = await getDb();
    const teacher = await makeUser("ta_teacher", "teacher");
    const other = await makeUser("ta_other", "teacher");

    const created = await createTeacherAssignment(db, teacher, {
      title: "Algebra Worksheet 4",
      subject: "Mathematics",
      classGrade: "Grade 9",
      status: "draft",
      dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      maxMarks: 20,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const mine = await listTeacherAssignments(db, { createdBy: teacher });
    expect(mine).toHaveLength(1);
    const theirs = await listTeacherAssignments(db, { createdBy: other });
    expect(theirs).toHaveLength(0);

    const published = await updateTeacherAssignment(db, created.assignmentId, {
      status: "published",
    });
    expect(published.ok).toBe(true);
    const only = await listTeacherAssignments(db, { createdBy: teacher, status: "published" });
    expect(only).toHaveLength(1);
  });

  it("rejects invalid assignment data", async () => {
    const db = await getDb();
    const teacher = await makeUser("ta_invalid", "teacher");
    expect((await createTeacherAssignment(db, teacher, { title: "x", subject: "M", classGrade: "G" })).ok).toBe(false);
    expect((await createTeacherAssignment(db, teacher, { title: "Valid title", subject: "", classGrade: "G" })).ok).toBe(false);
    expect((await createTeacherAssignment(db, teacher, { title: "Valid title", subject: "M", classGrade: " " })).ok).toBe(false);
    expect(
      (await createTeacherAssignment(db, teacher, {
        title: "Valid title",
        subject: "M",
        classGrade: "G",
        attachmentUrl: "javascript:alert(1)",
      })).ok
    ).toBe(false);
    expect(
      (await createTeacherAssignment(db, teacher, {
        title: "Valid title",
        subject: "M",
        classGrade: "G",
        maxMarks: 0,
      })).ok
    ).toBe(false);
  });

  it("computes the uncompleted student list from real submissions", async () => {
    const db = await getDb();
    const teacher = await makeUser("ta_monitor", "teacher");
    const a = await makeUser("ta_student_a", "student", "Grade 9");
    const b = await makeUser("ta_student_b", "student", "Grade 9");
    await makeUser("ta_student_c", "student", "Grade 9");
    const outsider = await makeUser("ta_outsider", "student", "Grade 10");

    const created = await createTeacherAssignment(db, teacher, {
      title: "Algebra Worksheet 4",
      subject: "Mathematics",
      classGrade: "Grade 9",
      status: "published",
      dueDate: new Date(Date.now() + 3 * 24 * 3600 * 1000),
      maxMarks: 20,
    });
    if (!created.ok) throw new Error("setup failed");

    let monitor = await assignmentMonitor(db, created.assignmentId);
    expect(monitor?.totals.assigned).toBe(3);
    expect(monitor?.totals.completed).toBe(0);
    expect(monitor?.totals.completionRate).toBe(0);
    // Nobody has done anything, so nobody is overdue before the due date.
    expect(monitor?.totals.overdue).toBe(0);

    await submitAssignment(db, { assignmentId: created.assignmentId, studentId: a });
    await submitAssignment(db, {
      assignmentId: created.assignmentId,
      studentId: b,
      status: "in_progress",
      progress: 40,
    });

    monitor = await assignmentMonitor(db, created.assignmentId);
    expect(monitor?.totals.completed).toBe(1);
    expect(monitor?.totals.inProgress).toBe(1);
    expect(monitor?.totals.notStarted).toBe(1);
    expect(monitor?.totals.assigned).toBe(3);
    // A different class is never counted.
    expect(monitor?.rows.some((r) => r.studentId === outsider.toHexString())).toBe(false);

    const notCompleted = await assignmentMonitor(db, created.assignmentId, {
      filter: "not_completed",
    });
    expect(notCompleted?.rows).toHaveLength(2);
    const completed = await assignmentMonitor(db, created.assignmentId, { filter: "completed" });
    expect(completed?.rows).toHaveLength(1);
    expect(completed?.rows[0].studentId).toBe(a.toHexString());

    // The denormalized counters match the real submissions.
    const assignment = await col(db, "classAssignments").findOne({
      _id: created.assignmentId,
    } as never) as unknown as { assignedCount: number; completedCount: number };
    expect(assignment.completedCount).toBe(1);
    expect(assignment.assignedCount).toBe(3);
  });

  it("marks unfinished work overdue once the due date passes", async () => {
    const db = await getDb();
    const teacher = await makeUser("ta_overdue", "teacher");
    const a = await makeUser("ta_over_a", "student", "Grade 8");
    const b = await makeUser("ta_over_b", "student", "Grade 8");

    const created = await createTeacherAssignment(db, teacher, {
      title: "Past due worksheet",
      subject: "Physics",
      classGrade: "Grade 8",
      status: "published",
      dueDate: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    });
    if (!created.ok) throw new Error("setup failed");

    await submitAssignment(db, { assignmentId: created.assignmentId, studentId: a });
    const monitor = await assignmentMonitor(db, created.assignmentId);
    expect(monitor?.totals.overdue).toBe(1);
    const overdueRows = await assignmentMonitor(db, created.assignmentId, { filter: "overdue" });
    expect(overdueRows?.rows.map((r) => r.studentId)).toEqual([b.toHexString()]);
    // A completed student is never overdue.
    expect(overdueRows?.rows.some((r) => r.studentId === a.toHexString())).toBe(false);
  });

  it("reports no roster data honestly when the class has no students", async () => {
    const db = await getDb();
    const teacher = await makeUser("ta_empty", "teacher");
    const created = await createTeacherAssignment(db, teacher, {
      title: "Nobody assigned",
      subject: "Art",
      classGrade: "Grade 99",
      status: "published",
    });
    if (!created.ok) throw new Error("setup failed");
    const monitor = await assignmentMonitor(db, created.assignmentId);
    expect(monitor?.totals.assigned).toBe(0);
    // Null, not 0 — the UI can distinguish "no roster" from "0% complete".
    expect(monitor?.totals.completionRate).toBeNull();
    expect(monitor?.rows).toHaveLength(0);
  });

  it("converges on one submission row under duplicate submissions", async () => {
    const db = await getDb();
    const teacher = await makeUser("ta_race", "teacher");
    const student = await makeUser("ta_race_student", "student", "Grade 7");
    const created = await createTeacherAssignment(db, teacher, {
      title: "Race test",
      subject: "Math",
      classGrade: "Grade 7",
      status: "published",
    });
    if (!created.ok) throw new Error("setup failed");

    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        submitAssignment(db, {
          assignmentId: created.assignmentId,
          studentId: student,
          status: i === 5 ? "completed" : "in_progress",
          progress: i * 10,
        })
      )
    );

    // Six concurrent submissions must produce exactly ONE row: the unique
    // (assignmentId, studentId) index plus the upsert guarantee no duplication.
    const rows = await col(db, "assignmentSubmissions").countDocuments({
      assignmentId: created.assignmentId,
      studentId: student,
    } as never);
    expect(rows).toBe(1);
    const sub = await getSubmission(db, created.assignmentId, student);
    expect(sub).not.toBeNull();
    // Last writer wins, so the row holds one coherent status/progress pair.
    expect(["in_progress", "completed"]).toContain(sub?.status);
    if (sub?.status === "completed") expect(sub.progress).toBe(100);
    else expect(sub?.progress).toBeLessThan(100);
    await refreshAssignmentCounts(db, created.assignmentId);
    const assignment = await col(db, "classAssignments").findOne({
      _id: created.assignmentId,
    } as never) as unknown as { completedCount: number };
    // The denormalized counter always equals the real submission rows.
    const completedRows = await col(db, "assignmentSubmissions").countDocuments({
      assignmentId: created.assignmentId,
      status: { $in: ["submitted", "completed"] },
    } as never);
    expect(assignment.completedCount).toBe(completedRows);
    expect(assignment.completedCount).toBeLessThanOrEqual(1);
  });

  it("refuses submissions to a closed or draft assignment", async () => {
    const db = await getDb();
    const teacher = await makeUser("ta_closed", "teacher");
    const student = await makeUser("ta_closed_student", "student", "Grade 6");
    const draft = await createTeacherAssignment(db, teacher, {
      title: "Draft only",
      subject: "Math",
      classGrade: "Grade 6",
      status: "draft",
    });
    if (!draft.ok) throw new Error("setup failed");
    const r1 = await submitAssignment(db, { assignmentId: draft.assignmentId, studentId: student });
    expect(r1.ok).toBe(false);
    expect(r1.ok === false && r1.reason).toBe("not_found");

    await updateTeacherAssignment(db, draft.assignmentId, { status: "published" });
    await updateTeacherAssignment(db, draft.assignmentId, { status: "closed" });
    const r2 = await submitAssignment(db, { assignmentId: draft.assignmentId, studentId: student });
    expect(r2.ok).toBe(false);
    expect(r2.ok === false && r2.reason).toBe("closed");
  });

  it("enforces ownership on edit, delete and grading", async () => {
    const db = await getDb();
    const teacher = await makeUser("ta_owner", "teacher");
    const intruder = await makeUser("ta_intruder", "teacher");
    const student = await makeUser("ta_owner_student", "student", "Grade 5");
    const created = await createTeacherAssignment(db, teacher, {
      title: "Owned assignment",
      subject: "Math",
      classGrade: "Grade 5",
      status: "published",
      maxMarks: 10,
    });
    if (!created.ok) throw new Error("setup failed");
    await submitAssignment(db, { assignmentId: created.assignmentId, studentId: student });

    const asOwner = { id: teacher.toHexString(), role: "teacher" };
    const asIntruder = { id: intruder.toHexString(), role: "teacher" };
    const asAdmin = { id: "0".repeat(24), role: "admin" };

    expect(canManageAssignment({ createdBy: teacher } as never, asOwner)).toBe(true);
    expect(canManageAssignment({ createdBy: teacher } as never, asIntruder)).toBe(false);
    expect(canManageAssignment({ createdBy: teacher } as never, asAdmin)).toBe(true);

    expect((await deleteTeacherAssignment(db, created.assignmentId)).ok).toBe(true);
    // Cascading cleanup: no orphan submissions for a deleted assignment.
    expect(
      await col(db, "assignmentSubmissions").countDocuments({ assignmentId: created.assignmentId } as never)
    ).toBe(0);
  });

  it("caps a grade at the assignment maximum", async () => {
    const db = await getDb();
    const teacher = await makeUser("ta_grade", "teacher");
    const student = await makeUser("ta_grade_student", "student", "Grade 4");
    const created = await createTeacherAssignment(db, teacher, {
      title: "Graded work",
      subject: "Math",
      classGrade: "Grade 4",
      status: "published",
      maxMarks: 10,
    });
    if (!created.ok) throw new Error("setup failed");
    await submitAssignment(db, { assignmentId: created.assignmentId, studentId: student });

    const tooHigh = await gradeSubmission(db, created.assignmentId, student, teacher, { score: 50 });
    expect(tooHigh.ok).toBe(false);
    const fine = await gradeSubmission(db, created.assignmentId, student, teacher, {
      score: 9,
      feedback: "good work",
    });
    expect(fine.ok).toBe(true);
    const sub = await getSubmission(db, created.assignmentId, student);
    expect(sub?.score).toBe(9);
    expect(sub?.feedback).toBe("good work");
    expect(sub?.gradedBy?.toHexString()).toBe(teacher.toHexString());
  });

  it("scopes a teacher's student list to the classes they actually teach", async () => {
    const db = await getDb();
    const teacher = await makeUser("ta_scope", "teacher");
    const taught = await makeUser("ta_scope_taught", "student", "Grade 11");
    const other = await makeUser("ta_scope_other", "student", "Grade 12");
    await createTeacherAssignment(db, teacher, {
      title: "Grade 11 work",
      subject: "Chemistry",
      classGrade: "Grade 11",
      status: "published",
    });

    const scope = await studentsInScope(db, {
      id: teacher.toHexString(),
      role: "teacher",
    });
    const ids = scope.students.map((s) =>
      String((s as unknown as { _id: { toHexString(): string } })._id.toHexString())
    );
    expect(ids).toContain(taught.toHexString());
    expect(ids).not.toContain(other.toHexString());
    expect(scope.grades).toEqual(["Grade 11"]);

    // Admins see everyone.
    const adminScope = await studentsInScope(db, { id: "0".repeat(24), role: "admin" });
    const adminIds = adminScope.students.map((s) =>
      String((s as unknown as { _id: { toHexString(): string } })._id.toHexString())
    );
    expect(adminIds).toContain(other.toHexString());
  });
});

describe("exam builder", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  async function examWithQuestions(teacher: ObjectId, questions: unknown[], classGrade = "Grade 9") {
    const db = await getDb();
    const exam = await createExam(db, teacher, {
      title: "Mixed exam",
      subject: "Physics",
      classGrade,
      mode: "timed",
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 24 * 3600 * 1000),
      totalMarks: 10,
      passingMarks: 5,
      attemptLimit: 2,
    });
    if (!exam.ok) throw new Error("setup failed");
    await replaceQuestions(db, exam.examId, questions as never);
    return exam;
  }

  const MCQ: Omit<ExamQuestion, "autoGradable"> & { autoGradable?: boolean } = {
    id: "q1",
    type: "mcq",
    prompt: "What is 2 + 2?",
    marks: 2,
    difficulty: "easy",
    options: [
      { id: "a", text: "3", isCorrect: false },
      { id: "b", text: "4", isCorrect: true },
      { id: "c", text: "5", isCorrect: false },
    ],
    pairs: [],
    correctAnswers: [],
    numericRange: null,
    explanation: "Basic arithmetic",
    attachmentUrl: null,
    caseStudyText: null,
  };

  it("marks only deterministic question types as auto-gradable", () => {
    expect(isAutoGradable("mcq")).toBe(true);
    expect(isAutoGradable("multiple_select")).toBe(true);
    expect(isAutoGradable("true_false")).toBe(true);
    expect(isAutoGradable("fill_blank")).toBe(true);
    expect(isAutoGradable("matching")).toBe(true);
    expect(isAutoGradable("numerical")).toBe(true);
    expect(isAutoGradable("essay")).toBe(false);
    expect(isAutoGradable("long_answer")).toBe(false);
    expect(isAutoGradable("case_based")).toBe(false);
    expect(isAutoGradable("descriptive")).toBe(false);
    expect(isAutoGradable("assertion_reason")).toBe(false);
  });

  it("recomputes total marks from the questions", async () => {
    const db = await getDb();
    const teacher = await makeUser("ex_marks", "teacher");
    const exam = await examWithQuestions(teacher, [
      MCQ,
      {
        ...MCQ,
        id: "q2",
        type: "essay",
        prompt: "Explain gravity",
        marks: 8,
        options: [],
      },
    ]);
    const row = await col(db, "classExams").findOne({ _id: exam.examId } as never) as unknown as {
      totalMarks: number;
      questions: Array<{ autoGradable: boolean }>;
    };
    expect(row.totalMarks).toBe(10);
    expect(row.questions[0].autoGradable).toBe(true);
    expect(row.questions[1].autoGradable).toBe(false);
  });

  it("refuses to publish an exam with no questions", async () => {
    const db = await getDb();
    const teacher = await makeUser("ex_nopublish", "teacher");
    const exam = await createExam(db, teacher, {
      title: "Empty exam",
      subject: "Math",
      classGrade: "Grade 3",
      startsAt: new Date(),
      totalMarks: 10,
      passingMarks: 4,
    });
    if (!exam.ok) throw new Error("setup failed");
    const result = await publishExam(db, exam.examId);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("no_questions");

    await replaceQuestions(db, exam.examId, [MCQ]);
    expect((await publishExam(db, exam.examId)).ok).toBe(true);
  });

  it("validates the exam window and passing marks", async () => {
    const db = await getDb();
    const teacher = await makeUser("ex_invalid", "teacher");
    expect(
      (await createExam(db, teacher, {
        title: "Bad marks",
        subject: "Math",
        classGrade: "Grade 3",
        startsAt: new Date(),
        totalMarks: 5,
        passingMarks: 9,
      })).ok
    ).toBe(false);
    expect(
      (await createExam(db, teacher, {
        title: "Bad window",
        subject: "Math",
        classGrade: "Grade 3",
        startsAt: new Date(Date.now() + 10000),
        endsAt: new Date(Date.now()),
        totalMarks: 10,
        passingMarks: 4,
      })).ok
    ).toBe(false);
  });

  it("auto-grades objective questions and holds written ones for a teacher", async () => {
    const db = await getDb();
    const teacher = await makeUser("ex_grade", "teacher");
    const student = await makeUser("ex_grade_student", "student", "Grade 9");
    const exam = await examWithQuestions(
      teacher,
      [
        MCQ,
        { ...MCQ, id: "q2", type: "essay", prompt: "Explain gravity", marks: 8, options: [] },
      ],
      "Grade 9"
    );
    await publishExam(db, exam.examId);

    const started = await startAttempt(db, exam.examId, student);
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const submitted = await submitAttempt(db, {
      examId: exam.examId,
      studentId: student,
      answers: [
        { questionId: "q1", optionIds: ["b"], text: "", matchedPairs: [], numeric: null, fileUrl: null },
        { questionId: "q2", optionIds: [], text: "A long written answer.", matchedPairs: [], numeric: null, fileUrl: null },
      ],
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok || !submitted.attempt) return;
    const attempt = submitted.attempt as unknown as {
      status: string;
      score: number | null;
      autoScore: number;
      answers: Array<{ awardedMarks: number | null; autoGraded: boolean }>;
    };
    // The MCQ is auto-graded; the essay is NOT guessed at.
    expect(attempt.autoScore).toBe(2);
    expect(attempt.answers[0].awardedMarks).toBe(2);
    expect(attempt.answers[1].awardedMarks).toBeNull();
    expect(attempt.status).toBe("submitted");
    // The total score stays null until every question is graded.
    expect(attempt.score).toBeNull();
  });

  it("grades written answers and releases results", async () => {
    const db = await getDb();
    const teacher = await makeUser("ex_release", "teacher");
    const student = await makeUser("ex_release_student", "student", "Grade 8");
    const exam = await examWithQuestions(teacher, [
      { ...MCQ, id: "q1", type: "essay", prompt: "Explain gravity", marks: 10, options: [] },
    ]);
    await publishExam(db, exam.examId);
    const started = await startAttempt(db, exam.examId, student);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    await submitAttempt(db, {
      examId: exam.examId,
      studentId: student,
      answers: [
        { questionId: "q1", optionIds: [], text: "My answer", matchedPairs: [], numeric: null, fileUrl: null },
      ],
    });

    const attempt = (await getAttempt(db, started.attemptId)) as unknown as { id: string };
    const graded = await gradeAttempt(db, started.attemptId, teacher, {
      marks: [{ questionId: "q1", awardedMarks: 7, notes: "well argued" }],
    });
    expect(graded.ok).toBe(true);
    expect(graded.ok && graded.allGraded).toBe(true);
    expect(graded.ok && graded.score).toBe(7);
    expect(attempt.id).toBe(started.attemptId.toHexString());

    // Before release the student-facing summary withholds nothing they own, but
    // `resultsReleased` is false so the UI shows "not released".
    let results = await examResults(db, exam.examId);
    expect(results?.totals.graded).toBe(1);
    expect(results?.totals.averageScore).toBe(7);
    expect(results?.exam.resultsReleased).toBe(false);

    expect((await releaseResults(db, exam.examId, teacher)).ok).toBe(true);
    results = await examResults(db, exam.examId);
    expect(results?.exam.resultsReleased).toBe(true);
    expect(
      await col(db, "notifications").countDocuments({ type: "exam_result_released" } as never)
    ).toBe(1);
  });

  it("withholds scores from the student until the owner releases results", async () => {
    const db = await getDb();
    const teacher = await makeUser("ex_hidden", "teacher");
    const student = await makeUser("ex_hidden_student", "student", "Grade 5");
    const exam = await examWithQuestions(teacher, [{ ...MCQ, id: "q1", marks: 5 }]);
    await publishExam(db, exam.examId);
    const started = await startAttempt(db, exam.examId, student);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    await submitAttempt(db, {
      examId: exam.examId,
      studentId: student,
      answers: [
        { questionId: "q1", optionIds: ["b"], text: "", matchedPairs: [], numeric: null, fileUrl: null },
      ],
    });

    const before = (await getAttempt(db, started.attemptId)) as unknown as Record<string, unknown>;
    expect(before.score).toBe(5);
    // The attempt contract a student receives must not carry the score while
    // results are unreleased.
    const hidden = toExamAttemptJSON(before, { revealScores: false });
    expect(hidden.score).toBeNull();
    expect(hidden.percentage).toBeNull();
    expect(hidden.passed).toBeNull();
    expect(hidden.auto_score).toBeNull();
    expect(hidden.manual_score).toBeNull();
    expect((hidden.answers as Array<{ awarded_marks: number | null }>)[0].awarded_marks).toBeNull();
    // The manager view keeps everything.
    const visible = toExamAttemptJSON(before);
    expect(visible.score).toBe(5);
  });

  it("never overwrites a submitted attempt on a duplicate submission", async () => {
    const db = await getDb();
    const teacher = await makeUser("ex_dup", "teacher");
    const student = await makeUser("ex_dup_student", "student", "Grade 2");
    const exam = await examWithQuestions(teacher, [MCQ]);
    await publishExam(db, exam.examId);
    const started = await startAttempt(db, exam.examId, student);
    if (!started.ok) throw new Error("setup failed");

    const answers = [
      { questionId: "q1", optionIds: ["a"], text: "", matchedPairs: [], numeric: null, fileUrl: null },
    ];
    const first = await submitAttempt(db, { examId: exam.examId, studentId: student, answers });
    // A retry after a network error carries the same attemptId: it must be a
    // no-op, not an overwrite.
    const second = await submitAttempt(db, {
      examId: exam.examId,
      studentId: student,
      attemptId: started.attemptId,
      answers,
    });
    expect(first.ok && (first.duplicate ?? false)).toBe(false);
    expect(second.ok && (second.duplicate ?? false)).toBe(true);
    const stored = (await getAttempt(db, started.attemptId)) as unknown as { score: number };
    expect(stored.score).toBe(0); // "3" was wrong; the first submit stands.
  });

  it("allocates exactly one first attempt under concurrent starts", async () => {
    const db = await getDb();
    const teacher = await makeUser("ex_race", "teacher");
    const student = await makeUser("ex_race_student", "student", "Grade 1");
    const exam = await examWithQuestions(teacher, [MCQ]);
    await publishExam(db, exam.examId);

    const results = await Promise.all(
      Array.from({ length: 6 }, () => startAttempt(db, exam.examId, student))
    );
    // Every caller must end up on the SAME attempt: no loser may open a second.
    const ids = new Set(
      results.map((r) => (r.ok ? r.attemptId.toString() : `error:${r.reason}`))
    );
    expect(ids.size).toBe(1);
    const attempts = await col(db, "examAttempts").countDocuments({
      examId: exam.examId,
      studentId: student,
    } as never);
    expect(attempts).toBe(1);
    const open = await col(db, "examAttempts").countDocuments({
      examId: exam.examId,
      studentId: student,
      status: "in_progress",
    } as never);
    expect(open).toBe(1);

    // A 12-way race is equally safe.
    const burst = await Promise.all(
      Array.from({ length: 12 }, () => startAttempt(db, exam.examId, student))
    );
    expect(new Set(burst.filter((r) => r.ok).map((r) => r.attemptId.toString())).size).toBe(1);
    expect(
      await col(db, "examAttempts").countDocuments({
        examId: exam.examId,
        studentId: student,
      } as never)
    ).toBe(1);
  });

  it("enforces the attempt limit", async () => {
    const db = await getDb();
    const teacher = await makeUser("ex_limit", "teacher");
    const student = await makeUser("ex_limit_student", "student", "Grade 1");
    const exam = await examWithQuestions(teacher, [MCQ]);
    await publishExam(db, exam.examId);

    const first = await startAttempt(db, exam.examId, student);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await submitAttempt(db, {
      examId: exam.examId,
      studentId: student,
      attemptId: first.attemptId,
      answers: [],
    });
    const second = await startAttempt(db, exam.examId, student);
    expect(second.ok).toBe(true); // attemptLimit is 2

    if (second.ok) {
      await submitAttempt(db, {
        examId: exam.examId,
        studentId: student,
        attemptId: second.attemptId,
        answers: [],
      });
    }
    const third = await startAttempt(db, exam.examId, student);
    expect(third.ok).toBe(false);
    expect(third.ok === false && third.reason).toBe("no_attempts");
    const attempts = await studentAttempts(db, exam.examId, student);
    expect(attempts).toHaveLength(2);
  });

  it("refuses attempts outside the exam window or before publication", async () => {
    const db = await getDb();
    const teacher = await makeUser("ex_window", "teacher");
    const student = await makeUser("ex_window_student", "student", "Grade 1");

    const future = await createExam(db, teacher, {
      title: "Future exam",
      subject: "Math",
      classGrade: "Grade 1",
      startsAt: new Date(Date.now() + 24 * 3600 * 1000),
      totalMarks: 10,
      passingMarks: 4,
    });
    if (!future.ok) throw new Error("setup failed");
    await replaceQuestions(db, future.examId, [MCQ]);
    await publishExam(db, future.examId);
    const tooEarly = await startAttempt(db, future.examId, student);
    expect(tooEarly.ok).toBe(false);
    expect(tooEarly.ok === false && tooEarly.reason).toBe("not_started");

    const closed = await createExam(db, teacher, {
      title: "Closed exam",
      subject: "Math",
      classGrade: "Grade 1",
      startsAt: new Date(Date.now() - 48 * 3600 * 1000),
      endsAt: new Date(Date.now() - 24 * 3600 * 1000),
      totalMarks: 10,
      passingMarks: 4,
    });
    if (!closed.ok) throw new Error("setup failed");
    await replaceQuestions(db, closed.examId, [MCQ]);
    await publishExam(db, closed.examId);
    const tooLate = await startAttempt(db, closed.examId, student);
    expect(tooLate.ok).toBe(false);
    expect(tooLate.ok === false && tooLate.reason).toBe("closed");

    const draft = await createExam(db, teacher, {
      title: "Draft exam",
      subject: "Math",
      classGrade: "Grade 1",
      startsAt: new Date(Date.now() - 1000),
      totalMarks: 10,
      passingMarks: 4,
    });
    if (!draft.ok) throw new Error("setup failed");
    await replaceQuestions(db, draft.examId, [MCQ]);
    const notPublished = await startAttempt(db, draft.examId, student);
    expect(notPublished.ok).toBe(false);
    expect(notPublished.ok === false && notPublished.reason).toBe("not_open");
  });

  it("grades multiple-select, fill-blank, numerical and matching deterministically", async () => {
    const db = await getDb();
    const teacher = await makeUser("ex_types", "teacher");
    const student = await makeUser("ex_types_student", "student", "Grade 6");
    const exam = await examWithQuestions(teacher, [
      {
        id: "m1",
        type: "multiple_select",
        prompt: "Select the even numbers",
        marks: 4,
        difficulty: "medium",
        options: [
          { id: "a", text: "2", isCorrect: true },
          { id: "b", text: "3", isCorrect: false },
          { id: "c", text: "4", isCorrect: true },
          { id: "d", text: "5", isCorrect: false },
        ],
        pairs: [],
        correctAnswers: [],
        numericRange: null,
        explanation: null,
        attachmentUrl: null,
        caseStudyText: null,
      },
      {
        id: "f1",
        type: "fill_blank",
        prompt: "The capital of France is ____.",
        marks: 2,
        difficulty: "easy",
        options: [],
        pairs: [],
        correctAnswers: ["Paris", "paris"],
        numericRange: null,
        explanation: null,
        attachmentUrl: null,
        caseStudyText: null,
      },
      {
        id: "n1",
        type: "numerical",
        prompt: "What is 12 squared?",
        marks: 2,
        difficulty: "easy",
        options: [],
        pairs: [],
        correctAnswers: [],
        numericRange: { min: 144, max: 144 },
        explanation: null,
        attachmentUrl: null,
        caseStudyText: null,
      },
      {
        id: "g1",
        type: "matching",
        prompt: "Match the animals",
        marks: 2,
        difficulty: "medium",
        options: [],
        pairs: [
          { id: "p1", left: "Dog", right: "Bark" },
          { id: "p2", left: "Cat", right: "Meow" },
        ],
        correctAnswers: [],
        numericRange: null,
        explanation: null,
        attachmentUrl: null,
        caseStudyText: null,
      },
    ]);
    await publishExam(db, exam.examId);
    const started = await startAttempt(db, exam.examId, student);
    if (!started.ok) throw new Error("setup failed");

    const submitted = await submitAttempt(db, {
      examId: exam.examId,
      studentId: student,
      answers: [
        // One wrong selection zeroes the whole question (no free marks).
        { questionId: "m1", optionIds: ["a", "b"], text: "", matchedPairs: [], numeric: null, fileUrl: null },
        { questionId: "f1", optionIds: [], text: "  paris ", matchedPairs: [], numeric: null, fileUrl: null },
        { questionId: "n1", optionIds: [], text: "", matchedPairs: [], numeric: 143, fileUrl: null },
        {
          questionId: "g1",
          optionIds: [],
          text: "",
          matchedPairs: [
            { id: "p1", right: "Bark" },
            { id: "p2", right: "MEOW" },
          ],
          numeric: null,
          fileUrl: null,
        },
      ],
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok || !submitted.attempt) return;
    const attempt = submitted.attempt as unknown as {
      autoScore: number;
      score: number | null;
      answers: Array<{ questionId: string; awardedMarks: number }>;
    };
    const byId = Object.fromEntries(attempt.answers.map((a) => [a.questionId, a.awardedMarks]));
    expect(byId.m1).toBe(0); // wrong selection ⇒ 0
    expect(byId.f1).toBe(2); // case/whitespace-insensitive
    expect(byId.n1).toBe(0); // 143 is outside [144,144]
    expect(byId.g1).toBe(2); // both pairs correct (case-insensitive)
    expect(attempt.autoScore).toBe(4);
    // Everything auto-gradable ⇒ a real score, fully graded.
    expect(attempt.score).toBe(4);
  });

  it("reports students who never attempted, with a real roster only", async () => {
    const db = await getDb();
    const teacher = await makeUser("ex_results", "teacher");
    const attempted = await makeUser("ex_results_a", "student", "Grade 10");
    const absent = await makeUser("ex_results_b", "student", "Grade 10");
    const exam = await examWithQuestions(teacher, [MCQ], "Grade 10");
    // Recomputing marks from the questions makes totalMarks 2, so the pass mark
    // must be adjusted or nothing could ever pass.
    await updateExam(db, exam.examId, { passingMarks: 1 });
    await publishExam(db, exam.examId);
    const started = await startAttempt(db, exam.examId, attempted);
    if (!started.ok) throw new Error("setup failed");
    await submitAttempt(db, {
      examId: exam.examId,
      studentId: attempted,
      attemptId: started.attemptId,
      answers: [
        { questionId: "q1", optionIds: ["b"], text: "", matchedPairs: [], numeric: null, fileUrl: null },
      ],
    });

    const results = await examResults(db, exam.examId);
    expect(results?.totals.assigned).toBe(2);
    expect(results?.totals.attempted).toBe(1);
    expect(results?.totals.notAttempted).toBe(1);
    expect(results?.totals.passed).toBe(1);
    expect(results?.totals.passRate).toBe(100);
    expect(results?.rows.some((r) => r.studentId === absent.toHexString() && r.status === "not_attempted")).toBe(true);
    expect(results?.questionPerformance[0].attempted).toBe(1);
  });

  it("enforces exam ownership for editing, publishing and grading", async () => {
    const db = await getDb();
    const owner = await makeUser("ex_owner", "teacher");
    const intruder = await makeUser("ex_intruder", "teacher");
    const exam = await createExam(db, owner, {
      title: "Owned exam",
      subject: "Math",
      classGrade: "Grade 3",
      startsAt: new Date(),
      totalMarks: 10,
      passingMarks: 4,
    });
    if (!exam.ok) throw new Error("setup failed");

    expect(canManageExam({ createdBy: owner } as never, { id: owner.toHexString(), role: "teacher" })).toBe(true);
    expect(canManageExam({ createdBy: owner } as never, { id: intruder.toHexString(), role: "teacher" })).toBe(false);
    expect(canManageExam({ createdBy: owner } as never, { id: "0".repeat(24), role: "admin" })).toBe(true);

    expect((await updateExam(db, exam.examId, { title: "Renamed" })).ok).toBe(true);
    expect((await deleteExam(db, exam.examId)).ok).toBe(true);
  });

  it("removes attempts when an exam is deleted", async () => {
    const db = await getDb();
    const teacher = await makeUser("ex_delete", "teacher");
    const student = await makeUser("ex_delete_student", "student", "Grade 3");
    const exam = await examWithQuestions(teacher, [MCQ]);
    await publishExam(db, exam.examId);
    const started = await startAttempt(db, exam.examId, student);
    expect(started.ok).toBe(true);
    await deleteExam(db, exam.examId);
    expect(await col(db, "examAttempts").countDocuments({ examId: exam.examId } as never)).toBe(0);
  });
});