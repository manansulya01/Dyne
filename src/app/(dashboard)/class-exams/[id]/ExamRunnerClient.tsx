"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn, formatDate } from "@/lib/utils";
import { ArrowLeft, Clock, Send } from "lucide-react";

/**
 * Student exam runner.
 *
 * The question payload never includes correct answers; scoring happens
 * server-side. Submitting is idempotent (a double tap cannot overwrite a graded
 * attempt), and the countdown is advisory only — the server owns the window.
 */

interface Question {
  id: string;
  type: string;
  prompt: string;
  marks: number;
  difficulty: string;
  options: Array<{ id: string; text: string }>;
  pairs: Array<{ id: string; left: string; right: string }>;
  explanation: string | null;
  case_study_text: string | null;
  auto_gradable: boolean;
}

interface ExamMeta {
  id: string;
  title: string;
  subject: string;
  class_grade: string;
  mode: string;
  status: string;
  instructions: string | null;
  duration_minutes: number | null;
  total_marks: number;
  passing_marks: number;
  attempt_limit: number;
  question_count: number;
  results_released: boolean;
}

interface AttemptRow {
  id: string;
  attempt_number: number;
  status: string;
  score: number | null;
  max_score: number;
  percentage: number | null;
  passed: boolean | null;
  submitted_at: string | null;
  answers: Array<{
    question_id: string;
    option_ids: string[];
    text: string;
    awarded_marks: number | null;
  }>;
}

type AnswerState = {
  optionIds: string[];
  text: string;
  matchedPairs: Array<{ id: string; right: string }>;
  numeric: string;
  fileUrl: string | null;
};

export function ExamRunnerClient({ examId }: { examId: string }) {
  const [exam, setExam] = useState<ExamMeta | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/class-exams/${examId}?attempts=true`);
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error ?? "Could not load this exam.");
      return;
    }
    setExam(data.exam as ExamMeta);
    setQuestions((data.questions ?? []) as Question[]);
    const mine = (data.myAttempts ?? []) as AttemptRow[];
    setAttempts(mine);
    const inProgress = mine.find((a) => a.status === "in_progress");
    if (inProgress) {
      setAttemptId(inProgress.id);
      const restored: Record<string, AnswerState> = {};
      for (const a of inProgress.answers ?? []) {
        restored[a.question_id] = {
          optionIds: a.option_ids ?? [],
          text: a.text ?? "",
          matchedPairs: [],
          numeric: "",
          fileUrl: null,
        };
      }
      setAnswers(restored);
    }
  }, [examId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- exam server-state sync; refresh shared with submit
    void load();
  }, [load]);

  const activeAttempt = attempts.find((a) => a.id === attemptId) ?? null;
  const submitted = !!activeAttempt && activeAttempt.status !== "in_progress";

  // Countdown for timed exams. Advisory only: the server enforces the window.
  useEffect(() => {
    if (!exam?.duration_minutes || submitted) return;
    const ms = exam.duration_minutes * 60 * 1000;
    // Seed on the next tick so the countdown never renders during the effect.
    const seed = window.setTimeout(() => setSecondsLeft(Math.floor(ms / 1000)), 0);
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s === null ? null : Math.max(0, s - 1)));
    }, 1000);
    return () => {
      window.clearTimeout(seed);
      window.clearInterval(id);
    };
  }, [exam?.duration_minutes, submitted]);

  const start = async () => {
    setBusy(true);
    const res = await fetch(`/api/class-exams/${examId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: true }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setNotice(data.error ?? "Could not start the exam.");
      return;
    }
    setAttemptId(data.attemptId);
    setNotice(data.resumed ? "Resumed your in-progress attempt." : "Attempt started.");
  };

  const setAnswer = (questionId: string, patch: Partial<AnswerState>) => {
    const EMPTY_ANSWER: AnswerState = {
      optionIds: [],
      text: "",
      matchedPairs: [],
      numeric: "",
      fileUrl: null,
    };
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...EMPTY_ANSWER, ...(prev[questionId] ?? {}), ...patch },
    }));
  };

  const answered = useMemo(
    () => questions.filter((q) => {
      const a = answers[q.id];
      if (!a) return false;
      return a.optionIds.length > 0 || a.text.trim().length > 0 || a.matchedPairs.length > 0 || a.numeric !== "";
    }).length,
    [questions, answers]
  );

  const submit = async () => {
    if (!window.confirm("Submit your exam? You cannot change it afterwards.")) return;
    setBusy(true);
    const payload = questions.map((q) => {
      const a = answers[q.id];
      return {
        questionId: q.id,
        optionIds: a?.optionIds ?? [],
        text: a?.text ?? "",
        matchedPairs: a?.matchedPairs ?? [],
        numeric: a?.numeric === "" ? null : Number(a?.numeric),
        fileUrl: a?.fileUrl ?? null,
      };
    });
    const res = await fetch(`/api/class-exams/${examId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: payload, attemptId }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setNotice(data.error ?? "Could not submit the exam.");
      return;
    }
    setNotice(
      data.duplicate
        ? "This attempt was already submitted — nothing was overwritten."
        : data.needsGrading
          ? "Submitted. Written answers are awaiting your teacher's grading."
          : "Submitted and graded automatically."
    );
    await load();
  };

  if (!exam) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-4 sm:px-4">
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          {notice ?? "Loading exam…"}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
        <Link href="/class-exams">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All class exams
        </Link>
      </Button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-2 py-0.5 text-[11px]">{exam.subject}</span>
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] capitalize">{exam.mode}</span>
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] capitalize">{exam.status}</span>
        </div>
        <h1 className="mt-1.5 text-xl font-bold tracking-tight sm:text-2xl">{exam.title}</h1>
        <p className="text-sm text-muted-foreground">
          {exam.question_count} questions · {exam.total_marks} marks · pass {exam.passing_marks} ·{" "}
          {exam.attempt_limit} attempt{exam.attempt_limit === 1 ? "" : "s"} allowed
        </p>
        {secondsLeft !== null && !submitted && (
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} remaining
          </p>
        )}
      </div>

      {exam.instructions && (
        <Card>
          <CardContent className="pt-4">
            <h2 className="font-semibold">Instructions</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm">{exam.instructions}</p>
          </CardContent>
        </Card>
      )}

      {notice && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
          {notice}
        </p>
      )}

      {/* Attempts summary */}
      {attempts.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h2 className="font-semibold">Your attempts</h2>
            <ul className="mt-2 space-y-1.5">
              {attempts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded bg-muted px-2 py-0.5 text-[11px]">Attempt {a.attempt_number}</span>
                  <span className="capitalize">{a.status.replace("_", " ")}</span>
                  {a.submitted_at && (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(a.submitted_at)}
                    </span>
                  )}
                  <span className="ml-auto text-xs font-semibold tabular-nums">
                    {exam.results_released
                      ? a.score === null
                        ? "awaiting grading"
                        : `${a.score}/${a.max_score}${a.passed === null ? "" : a.passed ? " · pass" : " · fail"}`
                      : "results not released"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!attemptId && (
        <Button className="min-h-[48px] w-full" onClick={start} disabled={busy || exam.status !== "published"}>
          {busy ? "Starting…" : attempts.length > 0 ? "Start another attempt" : "Start exam"}
        </Button>
      )}

      {attemptId && !submitted && (
        <>
          <p className="text-sm text-muted-foreground">
            {answered} of {questions.length} answered
          </p>
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              index={i}
              question={q}
              value={answers[q.id] ?? null}
              onChange={(patch) => setAnswer(q.id, patch)}
            />
          ))}
          <Button className="min-h-[48px] w-full" onClick={submit} disabled={busy}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {busy ? "Submitting…" : "Submit exam"}
          </Button>
        </>
      )}

      {submitted && exam.results_released && activeAttempt && (
        <Card>
          <CardContent className="pt-4">
            <h2 className="font-semibold">Result</h2>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">
              {activeAttempt.score ?? "—"}
              <span className="text-base text-muted-foreground">/{activeAttempt.max_score}</span>
              {activeAttempt.percentage !== null && (
                <span className="ml-2 text-base font-semibold text-muted-foreground">
                  {activeAttempt.percentage}%
                </span>
              )}
            </p>
            {activeAttempt.passed !== null && (
              <p
                className={cn(
                  "mt-1 text-sm font-semibold",
                  activeAttempt.passed
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                )}
              >
                {activeAttempt.passed ? "Passed" : "Not passed"}
              </p>
            )}
            <ul className="mt-3 space-y-1.5">
              {(activeAttempt.answers ?? []).map((a) => {
                const q = questions.find((x) => x.id === a.question_id);
                return (
                  <li key={a.question_id} className="rounded-lg bg-muted/60 p-2.5 text-sm">
                    <p className="line-clamp-2 font-medium">{q?.prompt ?? "Question"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {a.awarded_marks === null
                        ? "awaiting grading"
                        : `${a.awarded_marks}/${q?.marks ?? 0} marks`}
                      {q?.explanation ? ` · ${q.explanation}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {submitted && !exam.results_released && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm">
              Your attempt is submitted. Results appear here once your teacher releases them.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QuestionEditor({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: Question;
  value: AnswerState | null;
  onChange: (patch: Partial<AnswerState>) => void;
}) {
  const multiple = question.type === "multiple_select";
  const choice = ["mcq", "multiple_select", "true_false"].includes(question.type);

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold">
            Q{index + 1} · {question.type.replace(/_/g, " ")}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {question.marks} mark{question.marks === 1 ? "" : "s"} · {question.difficulty}
          </span>
        </div>
        {question.case_study_text && (
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/60 p-2 text-sm">
            {question.case_study_text}
          </p>
        )}
        <p className="mt-2 font-medium">{question.prompt}</p>

        {choice && (
          <fieldset className="mt-2 space-y-1.5">
            <legend className="sr-only">Options for question {index + 1}</legend>
            {question.options.map((o) => {
              const checked = value?.optionIds.includes(o.id) ?? false;
              return (
                <label
                  key={o.id}
                  className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-3 text-sm"
                >
                  <input
                    type={multiple ? "checkbox" : "radio"}
                    checked={checked}
                    onChange={(e) => {
                      if (multiple) {
                        const ids = new Set(value?.optionIds ?? []);
                        if (e.target.checked) ids.add(o.id);
                        else ids.delete(o.id);
                        onChange({ optionIds: [...ids] });
                      } else {
                        onChange({ optionIds: [o.id] });
                      }
                    }}
                  />
                  {o.text}
                </label>
              );
            })}
          </fieldset>
        )}

        {question.type === "fill_blank" && (
          <Input
            value={value?.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            maxLength={500}
            className="mt-2 min-h-[44px]"
            aria-label={`Answer for question ${index + 1}`}
            placeholder="Your answer"
          />
        )}

        {question.type === "numerical" && (
          <Input
            type="number"
            inputMode="decimal"
            value={value?.numeric ?? ""}
            onChange={(e) => onChange({ numeric: e.target.value })}
            className="mt-2 min-h-[44px]"
            aria-label={`Numeric answer for question ${index + 1}`}
          />
        )}

        {question.type === "matching" && (
          <div className="mt-2 space-y-2">
            {question.pairs.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{p.left}</span>
                <select
                  value={
                    value?.matchedPairs.find((m) => m.id === p.id)?.right ?? ""
                  }
                  onChange={(e) => {
                    const rest = (value?.matchedPairs ?? []).filter((m) => m.id !== p.id);
                    onChange({
                      matchedPairs: e.target.value
                        ? [...rest, { id: p.id, right: e.target.value }]
                        : rest,
                    });
                  }}
                  className="min-h-[44px] rounded-md border border-input bg-background px-2 text-sm"
                  aria-label={`Match for ${p.left}`}
                >
                  <option value="">Choose…</option>
                  {question.pairs.map((candidate) => (
                    <option key={candidate.id} value={candidate.right}>
                      {candidate.right}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {["short_answer", "long_answer", "descriptive", "essay", "assertion_reason"].includes(
          question.type
        ) && (
          <Textarea
            value={value?.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={question.type === "short_answer" ? 2 : 6}
            maxLength={20000}
            className="mt-2"
            aria-label={`Answer for question ${index + 1}`}
          />
        )}

        {question.type === "file_upload" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Document uploads are enabled by your teacher; attach the file from the assignment page and
            reference it here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
