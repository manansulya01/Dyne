"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { cn, formatDate } from "@/lib/utils";
import { PlayCircle } from "lucide-react";

/**
 * Student class exams.
 *
 * Answers are only visible once results are released, and only the signed-in
 * student's own attempts are ever fetched.
 */

interface ExamRow {
  id: string;
  title: string;
  subject: string;
  class_grade: string;
  mode: string;
  status: string;
  total_marks: number;
  question_count: number;
  starts_at: string | null;
  ends_at: string | null;
  results_released: boolean;
}

interface Attempt {
  id: string;
  attempt_number: number;
  status: string;
  score: number | null;
  max_score: number;
  percentage: number | null;
  passed: boolean | null;
  submitted_at: string | null;
}

export function ClassExamsClient({ initialExams }: { initialExams: ExamRow[] }) {
  const [exams, setExams] = useState<ExamRow[]>(initialExams);
  const [attempts, setAttempts] = useState<Record<string, Attempt[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/class-exams/student");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setExams(data.exams ?? []);
        setAttempts(data.attempts ?? {});
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Class exams</h1>
        <p className="text-sm text-muted-foreground">
          Exams published by your teachers. Attempt limits and timings are enforced server-side.
        </p>
      </div>

      {loading && exams.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          Loading…
        </p>
      )}

      {!loading && exams.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No exams published for your class yet.
        </p>
      )}

      <ul className="space-y-3">
        {exams.map((e) => {
          const mine = attempts[e.id] ?? [];
          const latest = mine[0] ?? null;
          return (
            <li key={e.id}>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-muted px-2 py-0.5 text-[11px]">{e.subject}</span>
                    <span className="rounded bg-muted px-2 py-0.5 text-[11px] capitalize">{e.mode}</span>
                    <span className="rounded bg-muted px-2 py-0.5 text-[11px] capitalize">
                      {e.status}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {e.question_count} questions · {e.total_marks} marks
                    </span>
                  </div>
                  <Link href={`/class-exams/${e.id}`} className="mt-1.5 block min-h-[44px]">
                    <h2 className="font-semibold">{e.title}</h2>
                  </Link>
                  {e.starts_at && (
                    <p className="text-xs text-muted-foreground">
                      Opens {formatDate(e.starts_at)}
                      {e.ends_at ? ` · closes ${formatDate(e.ends_at)}` : ""}
                    </p>
                  )}
                  {latest && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Attempt {latest.attempt_number} · {latest.status.replace("_", " ")}
                      {e.results_released && latest.score !== null
                        ? ` · ${latest.score}/${latest.max_score}`
                        : ""}
                      {!e.results_released ? " · results not released" : ""}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" className="min-h-[44px]">
                      <Link href={`/class-exams/${e.id}`}>
                        <PlayCircle className="h-4 w-4" aria-hidden="true" />
                        {latest?.status === "in_progress" ? "Resume" : "Open exam"}
                      </Link>
                    </Button>
                    {e.results_released && latest?.passed !== null && latest?.passed !== undefined && (
                      <span
                        className={cn(
                          "inline-flex min-h-[44px] items-center rounded-xl px-3 text-sm font-semibold",
                          latest.passed
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "bg-red-500/10 text-red-600 dark:text-red-400"
                        )}
                      >
                        {latest.passed ? "Passed" : "Not passed"}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
