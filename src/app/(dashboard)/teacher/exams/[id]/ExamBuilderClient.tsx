"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowDown, ArrowUp, Plus, Send, Trash2, BarChart3 } from "lucide-react";

/**
 * Flexible exam builder + results.
 *
 * One question schema covers MCQ, multi-select, true/false, short/long answer,
 * fill-in-the-blank, matching, assertion/reason, case-based (CBQ), numerical,
 * descriptive, essay and file-upload questions. Auto-gradable types are graded
 * by the platform; everything else waits for a teacher.
 */

type QuestionType =
  | "mcq"
  | "multiple_select"
  | "true_false"
  | "short_answer"
  | "long_answer"
  | "fill_blank"
  | "matching"
  | "assertion_reason"
  | "case_based"
  | "numerical"
  | "descriptive"
  | "essay"
  | "file_upload";

interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  marks: number;
  difficulty: "easy" | "medium" | "hard";
  options: Array<{ id: string; text: string; isCorrect?: boolean }>;
  pairs: Array<{ id: string; left: string; right: string }>;
  correctAnswers: string[];
  numericRange: { min: number; max: number } | null;
  explanation: string | null;
  attachmentUrl: string | null;
  caseStudyText: string | null;
  auto_gradable: boolean;
  correct_option_ids?: string[];
  correct_answers?: string[];
  numeric_range?: { min: number; max: number } | null;
}

const TYPES: Array<{ value: QuestionType; label: string; needsOptions: boolean }> = [
  { value: "mcq", label: "MCQ", needsOptions: true },
  { value: "multiple_select", label: "Multiple select", needsOptions: true },
  { value: "true_false", label: "True / False", needsOptions: true },
  { value: "short_answer", label: "Short answer", needsOptions: false },
  { value: "long_answer", label: "Long answer", needsOptions: false },
  { value: "fill_blank", label: "Fill in the blank", needsOptions: false },
  { value: "matching", label: "Matching", needsOptions: false },
  { value: "assertion_reason", label: "Assertion / Reason", needsOptions: false },
  { value: "case_based", label: "Case-based (CBQ)", needsOptions: false },
  { value: "numerical", label: "Numerical", needsOptions: false },
  { value: "descriptive", label: "Descriptive", needsOptions: false },
  { value: "essay", label: "Essay", needsOptions: false },
  { value: "file_upload", label: "File / document", needsOptions: false },
];

const AUTO_TYPES = new Set<QuestionType>([
  "mcq",
  "multiple_select",
  "true_false",
  "fill_blank",
  "matching",
  "numerical",
]);

function newId(): string {
  return `q_${Math.random().toString(36).slice(2, 10)}`;
}

function blankQuestion(type: QuestionType): Question {
  const base: Question = {
    id: newId(),
    type,
    prompt: "",
    marks: 1,
    difficulty: "medium",
    options: [],
    pairs: [],
    correctAnswers: [],
    numericRange: null,
    explanation: null,
    attachmentUrl: null,
    caseStudyText: null,
    auto_gradable: AUTO_TYPES.has(type),
  };
  if (type === "mcq" || type === "multiple_select") {
    base.options = [
      { id: `${newId()}_a`, text: "", isCorrect: type === "mcq" },
      { id: `${newId()}_b`, text: "", isCorrect: false },
      { id: `${newId()}_c`, text: "", isCorrect: false },
      { id: `${newId()}_d`, text: "", isCorrect: false },
    ];
  }
  if (type === "true_false") {
    base.options = [
      { id: `${newId()}_t`, text: "True", isCorrect: true },
      { id: `${newId()}_f`, text: "False", isCorrect: false },
    ];
  }
  if (type === "matching") {
    base.pairs = [
      { id: `${newId()}_1`, left: "", right: "" },
      { id: `${newId()}_2`, left: "", right: "" },
    ];
  }
  return base;
}

export function ExamBuilderClient({ examId }: { examId: string }) {
  const [exam, setExam] = useState<{
    id: string;
    title: string;
    subject: string;
    class_grade: string;
    mode: string;
    status: string;
    total_marks: number;
    passing_marks: number;
    attempt_limit: number;
    duration_minutes: number | null;
    results_released: boolean;
    printable: boolean;
  } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [tab, setTab] = useState<"builder" | "results" | "paper">("builder");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/class-exams/${examId}`);
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error ?? "Could not load the exam.");
      return;
    }
    setExam(data.exam);
    setQuestions((data.questions ?? []) as Question[]);
  }, [examId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- exam-detail server-state sync; refresh shared with builder actions
    void load();
  }, [load]);

  const saveQuestions = async (next: Question[]) => {
    setBusy(true);
    setNotice(null);
    try {
      const payload = next.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        marks: q.marks,
        difficulty: q.difficulty,
        options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: !!o.isCorrect })),
        pairs: q.pairs.map((p) => ({ id: p.id, left: p.left, right: p.right })),
        correctAnswers: q.correctAnswers,
        numericRange: q.numericRange,
        explanation: q.explanation,
        attachmentUrl: q.attachmentUrl,
        caseStudyText: q.caseStudyText,
      }));
      const res = await fetch(`/api/class-exams/${examId}/questions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        const first =
          typeof data.error === "string"
            ? data.error
            : data.error
              ? Object.values(data.error).flat().find((v: unknown) => typeof v === "string")
              : null;
        throw new Error(first || "Could not save the questions");
      }
      setQuestions(next);
      setNotice(`Saved ${data.questionCount} questions · ${data.totalMarks} marks.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not save the questions");
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/class-exams/${examId}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? "Could not publish the exam.");
        return;
      }
      setNotice("Exam published. Students in the class can now take it.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, delta: number) => {
    const next = [...questions];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setQuestions(next);
    void saveQuestions(next);
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
        <Link href="/teacher/exams">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All exams
        </Link>
      </Button>

      {exam && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{exam.title}</h1>
            <p className="text-sm text-muted-foreground">
              {exam.subject} · {exam.class_grade} · <span className="capitalize">{exam.mode}</span> ·{" "}
              <span className="capitalize">{exam.status}</span> · {exam.total_marks} marks ·{" "}
              {questions.length} question{questions.length === 1 ? "" : "s"}
            </p>
          </div>
          <Button className="min-h-[44px]" disabled={busy || questions.length === 0} onClick={publish}>
            <Send className="h-4 w-4" aria-hidden="true" /> Publish
          </Button>
        </div>
      )}

      {notice && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
          {notice}
        </p>
      )}

      <div className="flex gap-1.5" role="tablist" aria-label="Exam sections">
        {[
          { key: "builder" as const, label: "Question builder" },
          { key: "results" as const, label: "Results & grading" },
          ...(exam?.printable ? [{ key: "paper" as const, label: "Question paper" }] : []),
        ].map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "min-h-[44px] rounded-xl px-4 text-sm font-medium",
              tab === t.key ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "builder" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="q-type" className="text-sm font-medium">
              Add question
            </label>
            <select
              id="q-type"
              className="min-h-[44px] rounded-md border border-input bg-background px-3 text-sm"
              defaultValue="mcq"
              onChange={(e) => {
                const type = e.target.value as QuestionType;
                setQuestions((prev) => [...prev, blankQuestion(type)]);
                // Type change on an existing select would be ambiguous; reset.
                e.target.value = "mcq";
              }}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {questions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No questions yet. Add at least one before publishing.
            </p>
          ) : (
            <ul className="space-y-3">
              {questions.map((q, i) => (
                <li key={q.id}>
                  <QuestionEditor
                    question={q}
                    index={i}
                    total={questions.length}
                    onChange={(next) => {
                      const list = [...questions];
                      list[i] = next;
                      setQuestions(list);
                    }}
                    onSave={() => saveQuestions(questions)}
                    onMove={(delta) => move(i, delta)}
                    onDelete={() => {
                      const list = questions.filter((_, idx) => idx !== i);
                      setQuestions(list);
                      void saveQuestions(list);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}

          <Button
            variant="outline"
            className="min-h-[48px] w-full"
            disabled={busy}
            onClick={() => saveQuestions(questions)}
          >
            {busy ? "Saving…" : "Save questions"}
          </Button>
        </>
      )}

      {tab === "results" && <ExamResults examId={examId} />}

      {tab === "paper" && exam && <QuestionPaper exam={exam} questions={questions} />}
    </div>
  );
}

function QuestionEditor({
  question,
  index,
  total,
  onChange,
  onSave,
  onMove,
  onDelete,
}: {
  question: Question;
  index: number;
  total: number;
  onChange: (q: Question) => void;
  onSave: () => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const label = TYPES.find((t) => t.value === question.type)?.label ?? question.type;
  const needsOptions = question.options.length > 0;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold">{label}</span>
          <span className="text-xs text-muted-foreground">
            {question.auto_gradable ? "Auto-graded" : "Teacher graded"}
          </span>
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => onMove(-1)}
              disabled={index === 0}
              aria-label="Move question up"
              className="flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => onMove(1)}
              disabled={index === total - 1}
              aria-label="Move question down"
              className="flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40"
            >
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={onDelete}
              aria-label="Delete question"
              className="flex h-9 w-9 items-center justify-center rounded-lg border text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="sm:col-span-3">
            <label htmlFor={`q-${question.id}-prompt`} className="text-sm font-medium">
              Question
            </label>
            <Textarea
              id={`q-${question.id}-prompt`}
              value={question.prompt}
              onChange={(e) => onChange({ ...question, prompt: e.target.value })}
              rows={2}
              maxLength={5000}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`q-${question.id}-marks`} className="text-sm font-medium">
              Marks
            </label>
            <Input
              id={`q-${question.id}-marks`}
              type="number"
              min={1}
              max={1000}
              value={question.marks}
              onChange={(e) => onChange({ ...question, marks: Math.max(1, Number(e.target.value) || 1) })}
              className="mt-1 min-h-[44px]"
            />
          </div>
          <div>
            <label htmlFor={`q-${question.id}-diff`} className="text-sm font-medium">
              Difficulty
            </label>
            <select
              id={`q-${question.id}-diff`}
              value={question.difficulty}
              onChange={(e) =>
                onChange({ ...question, difficulty: e.target.value as Question["difficulty"] })
              }
              className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        {question.type === "case_based" && (
          <div className="mt-3">
            <label htmlFor={`q-${question.id}-case`} className="text-sm font-medium">
              Case study
            </label>
            <Textarea
              id={`q-${question.id}-case`}
              value={question.caseStudyText ?? ""}
              onChange={(e) => onChange({ ...question, caseStudyText: e.target.value })}
              rows={4}
              maxLength={8000}
              className="mt-1"
            />
          </div>
        )}

        {needsOptions && (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-medium">Options</p>
            {question.options.map((o, oi) => (
              <div key={o.id} className="flex items-center gap-2">
                {question.type === "true_false" ? null : (
                  <label className="flex min-h-[44px] items-center gap-2 text-xs">
                    <input
                      type={question.type === "multiple_select" ? "checkbox" : "radio"}
                      checked={!!o.isCorrect}
                      onChange={(e) => {
                        const options = [...question.options];
                        if (question.type === "mcq") {
                          // Exactly one correct option for MCQ.
                          options.forEach((x) => {
                            x.isCorrect = x.id === o.id;
                          });
                        } else {
                          options[oi] = { ...o, isCorrect: e.target.checked };
                        }
                        onChange({ ...question, options });
                      }}
                      aria-label={`Mark option ${oi + 1} correct`}
                    />
                    Correct
                  </label>
                )}
                <Input
                  value={o.text}
                  onChange={(e) => {
                    const options = [...question.options];
                    options[oi] = { ...o, text: e.target.value };
                    onChange({ ...question, options });
                  }}
                  placeholder={`Option ${oi + 1}`}
                  maxLength={500}
                  className="min-h-[44px] flex-1"
                  aria-label={`Option ${oi + 1} text`}
                />
                {question.type !== "true_false" && (
                  <button
                    onClick={() =>
                      onChange({ ...question, options: question.options.filter((_, x) => x !== oi) })
                    }
                    aria-label={`Remove option ${oi + 1}`}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border text-destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {question.type !== "true_false" && question.options.length < 12 && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={() =>
                  onChange({
                    ...question,
                    options: [...question.options, { id: `${newId()}_o`, text: "", isCorrect: false }],
                  })
                }
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add option
              </Button>
            )}
          </div>
        )}

        {question.type === "matching" && (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-medium">Matching pairs</p>
            {question.pairs.map((p, pi) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2">
                <Input
                  value={p.left}
                  onChange={(e) => {
                    const pairs = [...question.pairs];
                    pairs[pi] = { ...p, left: e.target.value };
                    onChange({ ...question, pairs });
                  }}
                  placeholder="Left"
                  maxLength={300}
                  className="min-h-[44px] flex-1"
                  aria-label={`Pair ${pi + 1} left`}
                />
                <Input
                  value={p.right}
                  onChange={(e) => {
                    const pairs = [...question.pairs];
                    pairs[pi] = { ...p, right: e.target.value };
                    onChange({ ...question, pairs });
                  }}
                  placeholder="Right (correct match)"
                  maxLength={300}
                  className="min-h-[44px] flex-1"
                  aria-label={`Pair ${pi + 1} right`}
                />
                <button
                  onClick={() => onChange({ ...question, pairs: question.pairs.filter((_, x) => x !== pi) })}
                  aria-label={`Remove pair ${pi + 1}`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border text-destructive"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px]"
              onClick={() =>
                onChange({ ...question, pairs: [...question.pairs, { id: newId(), left: "", right: "" }] })
              }
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add pair
            </Button>
          </div>
        )}

        {question.type === "fill_blank" && (
          <div className="mt-3">
            <label htmlFor={`q-${question.id}-answers`} className="text-sm font-medium">
              Accepted answers (comma separated)
            </label>
            <Input
              id={`q-${question.id}-answers`}
              value={question.correctAnswers.join(", ")}
              onChange={(e) =>
                onChange({
                  ...question,
                  correctAnswers: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 20),
                })
              }
              className="mt-1 min-h-[44px]"
            />
          </div>
        )}

        {question.type === "numerical" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`q-${question.id}-min`} className="text-sm font-medium">
                Accepted minimum
              </label>
              <Input
                id={`q-${question.id}-min`}
                type="number"
                value={question.numericRange?.min ?? ""}
                onChange={(e) =>
                  onChange({
                    ...question,
                    numericRange: {
                      min: Number(e.target.value),
                      max: question.numericRange?.max ?? Number(e.target.value),
                    },
                  })
                }
                className="mt-1 min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor={`q-${question.id}-max`} className="text-sm font-medium">
                Accepted maximum
              </label>
              <Input
                id={`q-${question.id}-max`}
                type="number"
                value={question.numericRange?.max ?? ""}
                onChange={(e) =>
                  onChange({
                    ...question,
                    numericRange: {
                      min: question.numericRange?.min ?? Number(e.target.value),
                      max: Number(e.target.value),
                    },
                  })
                }
                className="mt-1 min-h-[44px]"
              />
            </div>
          </div>
        )}

        <div className="mt-3">
          <label htmlFor={`q-${question.id}-expl`} className="text-sm font-medium">
            Explanation (shown after results are released)
          </label>
          <Input
            id={`q-${question.id}-expl`}
            value={question.explanation ?? ""}
            onChange={(e) => onChange({ ...question, explanation: e.target.value })}
            maxLength={2000}
            className="mt-1 min-h-[44px]"
          />
        </div>

        <Button size="sm" variant="outline" className="mt-3 min-h-[44px]" onClick={onSave}>
          Save this question
        </Button>
      </CardContent>
    </Card>
  );
}

function ExamResults({ examId }: { examId: string }) {
  const [data, setData] = useState<{
    totals: {
      assigned: number;
      attempted: number;
      notAttempted: number;
      graded: number;
      awaitingGrading: number;
      passed: number;
      failed: number;
      averageScore: number | null;
      highestScore: number | null;
      lowestScore: number | null;
      averagePercentage: number | null;
      passRate: number | null;
    };
    questionPerformance: Array<{
      questionId: string;
      prompt: string;
      marks: number;
      type: string;
      autoGradable: boolean;
      attempted: number;
      averageAwarded: number | null;
    }>;
    rows: Array<{
      attemptId: string;
      studentId: string;
      username: string | null;
      displayName: string | null;
      attemptNumber: number;
      status: string;
      score: number | null;
      maxScore: number;
      percentage: number | null;
      passed: boolean | null;
      submittedAt: string | null;
      needsGrading: boolean;
    }>;
    exam: Record<string, unknown>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [grading, setGrading] = useState<{
    attemptId: string;
    student: string;
    questions: GradeableQuestion[];
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/class-exams/${examId}/results?limit=100`);
    const json = await res.json();
    if (res.ok) setData(json);
    else setNotice(json.error ?? "Could not load results.");
  }, [examId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- results server-state sync; refresh shared with grading
    void load();
  }, [load]);

  const release = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/class-exams/${examId}/results`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultsReleased: true }),
      });
      const json = await res.json();
      setNotice(res.ok ? "Results released. Students were notified once each." : json.error);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const openGrading = async (attemptId: string, student: string) => {
    const res = await fetch(`/api/class-exams/${examId}/results/${attemptId}`);
    const json = await res.json();
    if (!res.ok) {
      setNotice(json.error ?? "Could not load the attempt.");
      return;
    }
    setGrading({
      attemptId,
      student,
      questions: (json.questions ?? []).map((q: ExamQuestionJSON) => {
        const answers = (json.answers ?? []) as Array<Record<string, unknown>>;
        const answer = answers.find(
          (a) => a.question_id === q.id
        ) as { awarded_marks: number | null } | undefined;
        return {
          questionId: q.id,
          prompt: q.prompt,
          marks: q.marks,
          type: q.type,
          autoGradable: q.auto_gradable,
          response: describeAnswer(answers, q.id),
          awarded: answer?.awarded_marks ?? null,
        };
      }),
    });
  };

  const saveGrades = async (
    attemptId: string,
    marks: Array<{ questionId: string; awardedMarks: number | null; notes?: string | null }>,
    graderNotes: string | null,
    onDone: () => void
  ) => {
    const res = await fetch(`/api/class-exams/${examId}/results/${attemptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marks, graderNotes }),
    });
    const json = await res.json();
    if (!res.ok) {
      setNotice(json.error ?? "Could not save the grades.");
      return;
    }
    setNotice(
      json.allGraded
        ? `Graded. Score ${json.score ?? 0}.`
        : "Saved. Some questions still need marks before the attempt is fully graded."
    );
    onDone();
    await load();
  };

  return (
    <div className="space-y-4">
      {notice && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
          {notice}
        </p>
      )}

      {data ? (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {[
              ["Assigned", data.totals.assigned],
              ["Attempted", data.totals.attempted],
              ["Not attempted", data.totals.notAttempted],
              ["Awaiting grading", data.totals.awaitingGrading],
              ["Passed", data.totals.passed],
              ["Failed", data.totals.failed],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border bg-card p-3">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 text-2xl font-extrabold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Average score", data.totals.averageScore],
              ["Highest", data.totals.highestScore],
              ["Lowest", data.totals.lowestScore],
              ["Average %", data.totals.averagePercentage],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums">
                  {value === null ? <span className="text-sm text-muted-foreground">No data</span> : value}
                </p>
              </div>
            ))}
          </div>

          {data.questionPerformance.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <BarChart3 className="h-4 w-4" aria-hidden="true" /> Question performance
                </h3>
                <ul className="mt-3 space-y-2">
                  {data.questionPerformance.map((q) => (
                    <li key={q.questionId} className="rounded-xl bg-muted/60 p-3">
                      <p className="line-clamp-2 text-sm font-medium">{q.prompt}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {q.type.replace(/_/g, " ")} · {q.marks} marks ·{" "}
                        {q.averageAwarded === null
                          ? "not graded yet"
                          : `average ${q.averageAwarded}/${q.marks}`}{" "}
                        · {q.attempted} answered
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button className="min-h-[44px]" disabled={busy} onClick={release}>
              Release results to students
            </Button>
            <Button variant="outline" className="min-h-[44px]" onClick={() => void load()}>
              Refresh
            </Button>
          </div>

          <ul className="space-y-2">
            {data.rows.map((r) => (
              <li key={`${r.attemptId || r.studentId}`}>
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-2 pt-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {r.displayName || r.username || "Unknown student"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.username ? `@${r.username} · ` : ""}
                        {r.status === "not_attempted"
                          ? "did not attempt"
                          : `attempt ${r.attemptNumber} · ${r.status.replace("_", " ")}`}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                      {r.score === null ? "—" : `${r.score}/${r.maxScore}`}
                    </span>
                    {r.passed !== null && (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          r.passed
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "bg-red-500/10 text-red-600 dark:text-red-400"
                        )}
                      >
                        {r.passed ? "Pass" : "Fail"}
                      </span>
                    )}
                    {r.needsGrading && r.attemptId && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[44px]"
                        onClick={() => openGrading(r.attemptId, r.displayName || r.username || "Student")}
                      >
                        Grade
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          {data.rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No attempts recorded yet.
            </p>
          )}
        </>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          Loading results…
        </p>
      )}

      {grading && (
        <GradeAttemptDialog
          attemptId={grading.attemptId}
          student={grading.student}
          questions={grading.questions}
          onClose={() => setGrading(null)}
          onSave={(marks, notes) => saveGrades(grading.attemptId, marks, notes, () => setGrading(null))}
        />
      )}
    </div>
  );
}

interface ExamQuestionJSON {
  id: string;
  prompt: string;
  marks: number;
  type: string;
  auto_gradable: boolean;
}

interface GradeableQuestion {
  questionId: string;
  prompt: string;
  marks: number;
  type: string;
  autoGradable: boolean;
  response: string;
  awarded: number | null;
}

/** Human-readable summary of a student's response to one question. */
function describeAnswer(answers: Array<Record<string, unknown>>, questionId: string): string {
  const a = answers.find((x) => x.question_id === questionId) as
    | {
        text?: string;
        option_ids?: string[];
        matched_pairs?: Array<{ id: string; right: string }>;
        numeric?: number | null;
        file_url?: string | null;
      }
    | undefined;
  if (!a) return "(no answer)";
  const parts: string[] = [];
  if (a.text && a.text.trim()) parts.push(a.text.trim());
  if (a.option_ids && a.option_ids.length) parts.push(`Selected: ${a.option_ids.join(", ")}`);
  if (a.matched_pairs && a.matched_pairs.length) {
    parts.push(a.matched_pairs.map((p) => `${p.id} → ${p.right}`).join("; "));
  }
  if (typeof a.numeric === "number") parts.push(`Numeric: ${a.numeric}`);
  if (a.file_url) parts.push(`File: ${a.file_url}`);
  return parts.length ? parts.join(" · ") : "(blank)";
}

function GradeAttemptDialog({
  attemptId,
  student,
  questions,
  onClose,
  onSave,
}: {
  attemptId: string;
  student: string;
  questions: GradeableQuestion[];
  onClose: () => void;
  onSave: (
    marks: Array<{ questionId: string; awardedMarks: number | null; notes?: string | null }>,
    notes: string | null
  ) => void | Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const q of questions) init[q.questionId] = q.awarded === null ? "" : String(q.awarded);
    return init;
  });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(
        questions.map((q) => {
          const raw = values[q.questionId];
          if (raw === undefined || raw.trim() === "") {
            return { questionId: q.questionId, awardedMarks: q.awarded };
          }
          const n = Number(raw);
          // Clamp to the question's own maximum; the server clamps too.
          return { questionId: q.questionId, awardedMarks: Number.isFinite(n) ? Math.min(n, q.marks) : q.awarded };
        }),
        notes.trim() || null
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Grade ${student}`}
    >
      <Card className="w-full max-w-2xl">
        <CardContent className="pt-4">
          <h3 className="text-lg font-semibold">Grade {student}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Attempt {attemptId.slice(0, 8)}…</p>
          <form onSubmit={submit} className="mt-3 space-y-3">
            {questions.length === 0 && (
              <p className="text-sm text-muted-foreground">This attempt has no questions.</p>
            )}
            {questions.map((q, i) => (
              <div key={q.questionId} className="rounded-xl border p-3">
                <p className="text-sm font-medium">
                  {i + 1}. {q.prompt}{" "}
                  <span className="text-muted-foreground">
                    ({q.marks} mark{q.marks === 1 ? "" : "s"}
                    {q.autoGradable ? ", auto-graded" : ""})
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/60 p-2 text-sm">
                  <span className="font-medium">Student answer: </span>
                  {q.response}
                </p>
                <div className="mt-2">
                  <label htmlFor={`mark-${q.questionId}`} className="text-xs font-medium">
                    Marks awarded
                  </label>
                  <Input
                    id={`mark-${q.questionId}`}
                    type="number"
                    min={0}
                    max={q.marks}
                    value={values[q.questionId] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [q.questionId]: e.target.value }))}
                    className="mt-1 min-h-[44px] max-w-[160px]"
                  />
                </div>
              </div>
            ))}
            <div>
              <label htmlFor="grader-notes" className="text-sm font-medium">
                Overall feedback (visible to the student after release)
              </label>
              <Textarea
                id="grader-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={5000}
                rows={3}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="min-h-[44px]">
                {busy ? "Saving…" : "Save grades"}
              </Button>
              <Button type="button" variant="ghost" className="min-h-[44px]" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function QuestionPaper({
  exam,
  questions,
}: {
  exam: { title: string; subject: string; class_grade: string; total_marks: number; duration_minutes: number | null; passing_marks: number };
  questions: Question[];
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <h2 className="text-lg font-bold">{exam.title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {exam.subject} · {exam.class_grade} · {exam.total_marks} marks · pass {exam.passing_marks}
          {exam.duration_minutes ? ` · ${exam.duration_minutes} minutes` : ""}
        </p>
        <ol className="mt-4 space-y-4">
          {questions.map((q, i) => (
            <li key={q.id}>
              <p className="text-sm font-medium">
                {i + 1}. {q.prompt}{" "}
                <span className="text-muted-foreground">({q.marks} mark{q.marks === 1 ? "" : "s"})</span>
              </p>
              {q.caseStudyText && (
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/60 p-2 text-sm">{q.caseStudyText}</p>
              )}
              {q.options.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {q.options.map((o) => (
                    <li key={o.id} className="text-sm">
                      • {o.text}
                    </li>
                  ))}
                </ul>
              )}
              {q.pairs.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {q.pairs.map((p) => (
                    <li key={p.id} className="text-sm">
                      • {p.left} — {p.right}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 h-16 rounded-lg border border-dashed" aria-hidden="true" />
            </li>
          ))}
        </ol>
        <Button
          className="mt-4 min-h-[44px]"
          onClick={() => window.print()}
          variant="outline"
        >
          Print question paper
        </Button>
      </CardContent>
    </Card>
  );
}
