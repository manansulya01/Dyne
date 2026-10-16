"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { cn, formatDate } from "@/lib/utils";
import { useIsOverdue } from "@/hooks/useNow";

/**
 * Student view of teacher-assigned class work.
 *
 * Only published assignments for the student's own class are ever returned by
 * the API; the status shown here is the student's real submission status.
 */

interface AssignmentRow {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  class_grade: string;
  status: string;
  due_date: string | null;
  max_marks: number | null;
  created_at: string;
}

interface Submission {
  status: string;
  progress: number;
  submitted_at: string | null;
  submission_text: string | null;
  score: number | null;
  feedback: string | null;
}

export function ClassAssignmentsClient({
  initialAssignments,
  initialSubmissions,
}: {
  initialAssignments: AssignmentRow[];
  initialSubmissions: Record<string, Submission | null>;
}) {
  const [items, setItems] = useState<AssignmentRow[]>(initialAssignments);
  const [subs, setSubs] = useState<Record<string, Submission | null>>(initialSubmissions);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/class-assignments?limit=50");
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? "Could not load class work.");
        return;
      }
      setItems(data.assignments ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial server-state sync
    void load();
  }, [load]);

  const submit = async (id: string, text: string) => {
    const res = await fetch(`/api/class-assignments/${id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "submitted", submissionText: text || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error ?? "Could not submit.");
      return;
    }
    setSubs((prev) => ({ ...prev, [id]: data.submission }));
    setNotice("Submitted. Your teacher can see it immediately.");
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Class work</h1>
        <p className="text-sm text-muted-foreground">
          Assignments your teachers have published for your class.
        </p>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
          {notice}
        </p>
      )}

      {loading && items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          Loading…
        </p>
      )}

      {!loading && items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No published class work yet. Check back after your next class.
        </p>
      )}

      <ul className="space-y-3">
        {items.map((a) => (
          <ClassAssignmentCard
            key={a.id}
            assignment={a}
            submission={subs[a.id] ?? null}
            onSubmit={(text) => submit(a.id, text)}
          />
        ))}
      </ul>

    </div>
  );
}

function ClassAssignmentCard({
  assignment,
  submission,
  onSubmit,
}: {
  assignment: AssignmentRow;
  submission: Submission | null;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState(submission?.submission_text ?? "");
  const [busy, setBusy] = useState(false);
  const overdue = useIsOverdue(assignment.due_date);
  const status = submission?.status ?? "not_started";
  const done = status === "submitted" || status === "completed";

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium">{assignment.subject}</span>
          <span className="rounded bg-muted px-2 py-0.5 text-[11px]">{assignment.class_grade}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
              done
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : overdue
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {done ? "submitted" : overdue ? "overdue" : status.replace("_", " ")}
          </span>
          {assignment.max_marks !== null && (
            <span className="text-[11px] text-muted-foreground">{assignment.max_marks} marks</span>
          )}
        </div>

        <Link href={`/class-assignments/${assignment.id}`} className="mt-1.5 block min-h-[44px]">
          <h2 className="font-semibold">{assignment.title}</h2>
        </Link>
        {assignment.description && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{assignment.description}</p>
        )}
        {assignment.due_date && (
          <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(assignment.due_date)}</p>
        )}
        {submission?.submitted_at && (
          <p className="text-xs text-muted-foreground">
            Submitted {formatDate(submission.submitted_at)}
          </p>
        )}
        {submission?.score !== null && submission?.score !== undefined && (
          <p className="mt-1 text-xs font-semibold">
            Score: {submission.score}
            {assignment.max_marks !== null ? `/${assignment.max_marks}` : ""}
          </p>
        )}
        {submission?.feedback && (
          <p className="mt-1 rounded-lg bg-muted/60 p-2 text-xs">{submission.feedback}</p>
        )}

        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            onSubmit(text);
            setBusy(false);
          }}
        >
          <label htmlFor={`submit-${assignment.id}`} className="text-sm font-medium">
            Your answer
          </label>
          <textarea
            id={`submit-${assignment.id}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={20000}
            className="w-full rounded-md border border-input bg-background p-3 text-sm"
            placeholder="Type your work, or attach a file from the assignment page."
          />
          <Button type="submit" disabled={busy} className="min-h-[44px]">
            {busy ? "Submitting…" : done ? "Resubmit" : "Submit work"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
