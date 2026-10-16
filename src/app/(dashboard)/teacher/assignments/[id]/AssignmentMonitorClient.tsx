"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { cn, formatDate } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

/**
 * Assignment completion monitor.
 *
 * THE key teacher view: for one assignment, who actually completed it and who
 * did not. Every row comes from the server, which derives it from the real
 * class roster plus real submission rows. Nothing is estimated.
 */

interface MonitorRow {
  studentId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  classGrade: string | null;
  status: "completed" | "in_progress" | "not_started" | "overdue";
  submissionStatus: string | null;
  progress: number;
  submittedAt: string | null;
  score: number | null;
  overdue: boolean;
}

interface MonitorPayload {
  assignment: {
    id: string;
    title: string;
    subject: string;
    class_grade: string;
    status: string;
    due_date: string | null;
    max_marks: number | null;
    instructions: string | null;
  };
  totals: {
    assigned: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    overdue: number;
    completionRate: number | null;
  };
  rows: MonitorRow[];
  hasMore: boolean;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "not_completed", label: "Not completed" },
  { key: "completed", label: "Completed" },
  { key: "overdue", label: "Overdue" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  in_progress: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  not_started: "bg-muted text-muted-foreground",
  overdue: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export function AssignmentMonitorClient({
  assignmentId,
  canGrade,
}: {
  assignmentId: string;
  canGrade: boolean;
}) {
  const [data, setData] = useState<MonitorPayload | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [gradeTarget, setGradeTarget] = useState<MonitorRow | null>(null);

  const load = useCallback(
    async (nextOffset: number, append = false) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ filter, limit: "50", offset: String(nextOffset) });
        const res = await fetch(`/api/class-assignments/${assignmentId}/monitor?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Could not load completion data.");
          return;
        }
        setData((prev) =>
          prev && append
            ? { ...json, rows: [...prev.rows, ...json.rows], hasMore: json.hasMore }
            : (json as MonitorPayload)
        );
        setOffset(nextOffset);
      } catch {
        setError("Could not load completion data.");
      } finally {
        setLoading(false);
      }
    },
    [assignmentId, filter]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filter-scoped server-state sync; refresh shared with grading
    void load(0);
  }, [load]);

  const totals = data?.totals;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
        <Link href="/teacher/assignments">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All assignments
        </Link>
      </Button>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {error}
        </p>
      )}

      {data && (
        <>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{data.assignment.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.assignment.subject} · {data.assignment.class_grade} ·{" "}
              <span className="capitalize">{data.assignment.status}</span>
              {data.assignment.due_date
                ? ` · due ${formatDate(data.assignment.due_date)}`
                : " · no due date"}
            </p>
            {data.assignment.instructions && (
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-sm">
                {data.assignment.instructions}
              </p>
            )}
          </div>

          {/* Completion summary — real counts from real submissions */}
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Assigned" value={totals?.assigned ?? 0} />
            <Stat label="Completed" value={totals?.completed ?? 0} tone="emerald" />
            <Stat label="In progress" value={totals?.inProgress ?? 0} tone="blue" />
            <Stat label="Not started" value={totals?.notStarted ?? 0} tone="muted" />
            <Stat label="Overdue" value={totals?.overdue ?? 0} tone="red" />
          </dl>

          {totals && totals.assigned === 0 ? (
            <p className="rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
              No students are registered in class{" "}
              <span className="font-medium">{data.assignment.class_grade}</span> yet, so completion cannot
              be calculated. Real students will appear here automatically once they join the class.
            </p>
          ) : (
            <>
              <div
                className="h-3 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={totals?.completionRate ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Assignment completion rate"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${totals?.completionRate ?? 0}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {totals?.completionRate ?? 0}% of {totals?.assigned ?? 0} students completed this
                assignment.
              </p>

              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter students">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    aria-pressed={filter === f.key}
                    className={cn(
                      "min-h-[44px] rounded-xl px-4 text-sm font-medium",
                      filter === f.key
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground"
                    )}
                  >
                    {f.label}
                    {f.key === "not_completed" && totals
                      ? ` (${totals.assigned - totals.completed})`
                      : ""}
                  </button>
                ))}
              </div>

              <ul className="space-y-2">
                {data.rows.map((row) => (
                  <li key={row.studentId}>
                    <Card>
                      <CardContent className="flex flex-wrap items-center gap-3 pt-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={row.avatarUrl || ""} alt="" />
                          <AvatarFallback name={row.displayName || row.username} />
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {row.displayName || row.username}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            @{row.username}
                            {row.classGrade ? ` · ${row.classGrade}` : ""}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
                            STATUS_STYLE[row.status === "not_started" && row.overdue ? "overdue" : row.status]
                          )}
                        >
                          {row.status === "not_started" && row.overdue ? "overdue" : row.status.replace("_", " ")}
                        </span>
                        {row.progress > 0 && row.status !== "completed" && (
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {row.progress}%
                          </span>
                        )}
                        {row.submittedAt && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            submitted {new Date(row.submittedAt).toLocaleString()}
                          </span>
                        )}
                        {row.score !== null && (
                          <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                            {row.score}
                            {data.assignment.max_marks ? `/${data.assignment.max_marks}` : ""}
                          </span>
                        )}
                        {canGrade && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-[44px]"
                            onClick={() => setGradeTarget(row)}
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
                  No students match this filter.
                </p>
              )}

              {data.hasMore && (
                <Button
                  variant="outline"
                  className="min-h-[48px] w-full"
                  disabled={loading}
                  onClick={() => void load(offset + data.rows.length, true)}
                >
                  {loading ? "Loading…" : "Load more students"}
                </Button>
              )}
            </>
          )}
        </>
      )}

      {loading && !data && (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          Loading completion data…
        </p>
      )}

      {gradeTarget && data && (
        <GradeDialog
          assignmentId={assignmentId}
          maxMarks={data.assignment.max_marks}
          student={gradeTarget}
          onClose={() => setGradeTarget(null)}
          onSaved={() => {
            setGradeTarget(null);
            void load(0);
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "red" | "blue" | "muted";
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "red"
        ? "text-red-600 dark:text-red-400"
        : tone === "blue"
          ? "text-blue-600 dark:text-blue-400"
          : "";
  return (
    <div className="rounded-xl border bg-card p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 text-2xl font-extrabold tabular-nums", cls)}>{value}</dd>
    </div>
  );
}

function GradeDialog({
  assignmentId,
  maxMarks,
  student,
  onClose,
  onSaved,
}: {
  assignmentId: string;
  maxMarks: number | null;
  student: MonitorRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/class-assignments/${assignmentId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.studentId,
          score: score ? Number(score) : null,
          feedback: feedback.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the grade");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the grade");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Grade ${student.displayName || student.username}`}
    >
      <Card className="w-full max-w-md">
        <CardContent className="pt-4">
          <h2 className="font-semibold">Grade {student.displayName || student.username}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {student.status === "completed" ? "Submitted" : "No submission"} ·{" "}
            {maxMarks ? `out of ${maxMarks} marks` : "no maximum set"}
          </p>
          <form onSubmit={submit} className="mt-3 space-y-3">
            <div>
              <label htmlFor="grade-score" className="text-sm font-medium">
                Score
              </label>
              <Input
                id="grade-score"
                type="number"
                min={0}
                max={maxMarks ?? undefined}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="mt-1 min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="grade-feedback" className="text-sm font-medium">
                Feedback
              </label>
              <textarea
                id="grade-feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                maxLength={5000}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="min-h-[44px]">
                {busy ? "Saving…" : "Save grade"}
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
