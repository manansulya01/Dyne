"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { formatDate, cn } from "@/lib/utils";
import { useIsOverdue } from "@/hooks/useNow";
import { ArrowLeft, Send } from "lucide-react";

/** Assignment detail with the student's own submission state. */

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  class_grade: string;
  instructions: string | null;
  status: string;
  due_date: string | null;
  attachment_url: string | null;
  max_marks: number | null;
}

interface Submission {
  status: string;
  progress: number;
  submitted_at: string | null;
  submission_url: string | null;
  submission_text: string | null;
  score: number | null;
  feedback: string | null;
}

export function ClassAssignmentDetail({
  assignment,
  isStudent,
  canManage,
}: {
  assignment: Assignment;
  isStudent: boolean;
  canManage: boolean;
}) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Read the caller's own submission; the API scopes it to the session.
    (async () => {
      const res = await fetch(`/api/class-assignments/${assignment.id}/submit`);
      if (!res.ok) return;
      const data = await res.json();
      setSubmission(data.submission ?? null);
      if (data.submission?.submission_text) setText(data.submission.submission_text);
    })();
  }, [assignment.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/class-assignments/${assignment.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "submitted", submissionText: text || undefined }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setNotice(data.error ?? "Could not submit.");
      return;
    }
    setSubmission(data.submission);
    setNotice("Submitted.");
  };

  const done = submission?.status === "submitted" || submission?.status === "completed";
  const overdue = useIsOverdue(assignment.due_date);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
        <Link href={canManage ? `/teacher/assignments/${assignment.id}` : "/class-assignments"}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </Link>
      </Button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-2 py-0.5 text-[11px]">{assignment.subject}</span>
          <span className="rounded bg-muted px-2 py-0.5 text-[11px]">{assignment.class_grade}</span>
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] capitalize">{assignment.status}</span>
          {done && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              submitted
            </span>
          )}
        </div>
        <h1 className="mt-1.5 text-xl font-bold tracking-tight sm:text-2xl">{assignment.title}</h1>
        {assignment.due_date && (
          <p className={cn("mt-1 text-sm", overdue && !done ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
            Due {formatDate(assignment.due_date)}
            {overdue && !done ? " · overdue" : ""}
          </p>
        )}
        {assignment.max_marks !== null && (
          <p className="text-sm text-muted-foreground">{assignment.max_marks} marks</p>
        )}
      </div>

      {assignment.description && (
        <Card>
          <CardContent className="pt-4">
            <p className="whitespace-pre-wrap text-sm">{assignment.description}</p>
          </CardContent>
        </Card>
      )}

      {assignment.instructions && (
        <Card>
          <CardContent className="pt-4">
            <h2 className="font-semibold">Instructions</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm">{assignment.instructions}</p>
          </CardContent>
        </Card>
      )}

      {assignment.attachment_url && (
        <p>
          <a
            href={assignment.attachment_url}
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary hover:underline"
          >
            Download attachment
          </a>
        </p>
      )}

      {isStudent && (
        <Card>
          <CardContent className="pt-4">
            <h2 className="font-semibold">Your submission</h2>
            {notice && (
              <p role="status" className="mt-2 rounded-lg bg-muted/60 p-2 text-sm">
                {notice}
              </p>
            )}
            {submission?.submitted_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                Submitted {formatDate(submission.submitted_at)}
              </p>
            )}
            {submission?.score !== null && submission?.score !== undefined && (
              <p className="mt-1 text-sm font-semibold">
                Score: {submission.score}
                {assignment.max_marks !== null ? `/${assignment.max_marks}` : ""}
              </p>
            )}
            {submission?.feedback && (
              <p className="mt-1 rounded-lg bg-muted/60 p-2 text-sm">{submission.feedback}</p>
            )}
            <form className="mt-3 space-y-2" onSubmit={submit}>
              <label htmlFor="submission-text" className="text-sm font-medium">
                Answer
              </label>
              <textarea
                id="submission-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                maxLength={20000}
                className="w-full rounded-md border border-input bg-background p-3 text-sm"
              />
              <Button type="submit" disabled={busy} className="min-h-[44px]">
                <Send className="h-4 w-4" aria-hidden="true" />
                {busy ? "Submitting…" : done ? "Resubmit work" : "Submit work"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
