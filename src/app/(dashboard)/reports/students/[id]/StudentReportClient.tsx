"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { cn, formatDate } from "@/lib/utils";
import { ArrowLeft, RefreshCw } from "lucide-react";

/**
 * Personalized student report.
 *
 * Design rule: sections show real data or an explicit empty state. Charts are
 * only drawn from real numbers; there is no invented "AI insight" narrative.
 * Privacy is enforced by the API (self / taught / admin) — this component only
 * renders what it is given.
 */

interface Section<T> {
  available: boolean;
  data: T | null;
}

interface Report {
  student: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
    class_grade: string | null;
    account_status: "active" | "suspended" | "banned";
    suspended_until: string | null;
    banned_at: string | null;
    joined_at: string;
  };
  scope: "self" | "taught" | "admin";
  generatedAt: string;
  academic: {
    classAssignments: Section<{
      assigned: number;
      completed: number;
      inProgress: number;
      notStarted: number;
      overdue: number;
      completionRate: number | null;
      perAssignment: Array<{
        assignmentId: string;
        title: string;
        subject: string;
        dueDate: string | null;
        status: string;
        submittedAt: string | null;
        score: number | null;
        maxMarks: number | null;
        overdue: boolean;
      }>;
    }>;
    exams: Section<{
      attempted: number;
      graded: number;
      awaitingGrading: number;
      averageScore: number | null;
      averagePercentage: number | null;
      highestScore: number | null;
      lowestScore: number | null;
      passed: number;
      failed: number;
      perExam: Array<{
        attemptId: string;
        examId: string;
        title: string;
        subject: string;
        mode: string;
        attemptNumber: number;
        status: string;
        score: number | null;
        maxScore: number;
        percentage: number | null;
        passed: boolean | null;
        resultsReleased: boolean;
      }>;
    }>;
    goals: Section<{
      total: number;
      active: number;
      completed: number;
      items: Array<{ id: string; title: string; current: number; target: number; unit: string; status: string; deadline: string | null }>;
    }>;
    habits: Section<{
      total: number;
      active: number;
      items: Array<{ id: string; name: string; frequency: string; todayCount: number; last7Days: Array<{ date: string; count: number }> }>;
    }>;
    studySessions: Section<{
      total: number;
      completed: number;
      totalSeconds: number;
      last7DaysSeconds: Array<{ date: string; seconds: number }>;
      bySubject: Array<{ subject: string | null; seconds: number }>;
    }>;
    studyMaterials: Section<{
      saved: number;
      recent: Array<{ id: string; title: string; subject: string; savedAt: string }>;
    }>;
  };
  usage: Record<
    string,
    Section<Record<string, unknown>> & { data: Record<string, unknown> | null }
  >;
  observations: string[];
}

export function StudentReportClient({
  studentId,
  isSelf,
}: {
  studentId: string;
  isSelf: boolean;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/student-reports/${studentId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load this report.");
        return;
      }
      setReport(data.report);
    } catch {
      setError("Could not load this report.");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- report server-state sync; refresh shared with the Refresh button
    void load();
  }, [load]);

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground" role="status">
        Building report…
      </p>
    );
  }

  if (error || !report) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-4 sm:px-4">
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {error ?? "Report not available."}
        </p>
      </div>
    );
  }

  const a = report.academic;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
        <Link href="/reports/students">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All reports
        </Link>
      </Button>

      {/* Student overview */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar className="h-14 w-14">
              <AvatarImage src={report.student.avatar_url || ""} alt="" />
              <AvatarFallback name={report.student.display_name || report.student.username} />
            </Avatar>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold tracking-tight">
                {report.student.display_name || report.student.username}
              </h1>
              <p className="text-sm text-muted-foreground">
                @{report.student.username}
                {report.student.class_grade ? ` · ${report.student.class_grade}` : " · no class set"}
                {` · joined ${formatDate(report.student.joined_at)}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Account:{" "}
                <span
                  className={cn(
                    "font-semibold capitalize",
                    report.student.account_status === "active"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  )}
                >
                  {report.student.account_status}
                </span>
                {" · "}view scope: {report.scope}
                {" · generated "}
                {formatDate(report.generatedAt)}
              </p>
            </div>
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Observations — strictly derived from the numbers below */}
      <Card>
        <CardContent className="pt-4">
          <h2 className="font-semibold">Observations</h2>
          <ul className="mt-2 space-y-1.5">
            {report.observations.map((o) => (
              <li key={o} className="flex gap-2 text-sm">
                <span aria-hidden="true">•</span>
                <span>{o}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            These statements are computed from Dyne&apos;s own records. Nothing here is generated or
            estimated.
          </p>
        </CardContent>
      </Card>

      {/* Academic performance */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Assignments">
          {!a.classAssignments.available ? (
            <Empty text="No published assignments for this student's class." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Assigned" value={a.classAssignments.data!.assigned} />
                <Metric label="Completed" value={a.classAssignments.data!.completed} tone="emerald" />
                <Metric label="Overdue" value={a.classAssignments.data!.overdue} tone="red" />
                <Metric
                  label="Rate"
                  value={a.classAssignments.data!.completionRate === null ? "—" : `${a.classAssignments.data!.completionRate}%`}
                />
              </div>
              <ul className="mt-3 space-y-1.5">
                {a.classAssignments.data!.perAssignment.slice(0, 8).map((x) => (
                  <li key={x.assignmentId} className="rounded-lg bg-muted/60 p-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{x.title}</span>
                      <StatusChip status={x.overdue ? "overdue" : x.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {x.subject}
                      {x.dueDate ? ` · due ${formatDate(x.dueDate)}` : ""}
                      {x.submittedAt ? ` · submitted ${formatDate(x.submittedAt)}` : ""}
                      {x.score !== null ? ` · score ${x.score}${x.maxMarks ? `/${x.maxMarks}` : ""}` : ""}
                    </p>
                  </li>
                ))}
                {a.classAssignments.data!.perAssignment.length > 8 && (
                  <li className="text-xs text-muted-foreground">
                    +{a.classAssignments.data!.perAssignment.length - 8} more
                  </li>
                )}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Exams">
          {!a.exams.available ? (
            <Empty text="No exam attempts recorded." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Attempts" value={a.exams.data!.attempted} />
                <Metric
                  label="Average"
                  value={a.exams.data!.averagePercentage === null ? "—" : `${a.exams.data!.averagePercentage}%`}
                />
                <Metric label="Passed" value={a.exams.data!.passed} tone="emerald" />
                <Metric label="Failed" value={a.exams.data!.failed} tone="red" />
              </div>
              <ul className="mt-3 space-y-1.5">
                {a.exams.data!.perExam.slice(0, 8).map((x) => (
                  <li key={x.attemptId} className="rounded-lg bg-muted/60 p-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{x.title}</span>
                      {x.passed === null ? (
                        <StatusChip status={x.status} />
                      ) : (
                        <StatusChip status={x.passed ? "passed" : "failed"} />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {x.subject} · {x.mode} · attempt {x.attemptNumber}
                      {x.resultsReleased
                        ? ` · ${x.score ?? 0}/${x.maxScore}`
                        : " · results not released yet"}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Study habits">
          {!a.habits.available ? (
            <Empty text="No habits tracked." />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {a.habits.data!.active} active of {a.habits.data!.total} tracked.
              </p>
              <ul className="mt-3 space-y-2">
                {a.habits.data!.items.slice(0, 6).map((h) => {
                  const max = Math.max(...h.last7Days.map((d) => d.count), 1);
                  return (
                    <li key={h.id}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{h.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {h.todayCount} today
                        </span>
                      </div>
                      <div className="mt-1 flex h-6 items-end gap-1" aria-hidden="true">
                        {h.last7Days.map((d) => (
                          <span
                            key={d.date}
                            className="w-full rounded-sm bg-primary/70"
                            style={{ height: `${Math.round((d.count / max) * 100)}%` }}
                            title={`${d.date}: ${d.count}`}
                          />
                        ))}
                      </div>
                      <p className="sr-only">
                        Last 7 days: {h.last7Days.map((d) => `${d.date}: ${d.count}`).join(", ")}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Study sessions">
          {!a.studySessions.available ? (
            <Empty text="No study sessions recorded." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Metric label="Sessions" value={a.studySessions.data!.completed} />
                <Metric
                  label="Total time"
                  value={`${Math.round((a.studySessions.data!.totalSeconds / 3600) * 10) / 10}h`}
                />
                <Metric label="Subjects" value={a.studySessions.data!.bySubject.length} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {a.studySessions.data!.bySubject.slice(0, 5).map((s) => (
                  <li key={s.subject ?? "none"} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{s.subject ?? "Unspecified"}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {Math.round(s.seconds / 60)}m
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Goals">
          {!a.goals.available ? (
            <Empty text="No goals set." />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {a.goals.data!.active} active · {a.goals.data!.completed} completed
              </p>
              <ul className="mt-3 space-y-1.5">
                {a.goals.data!.items.slice(0, 6).map((g) => {
                  const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
                  return (
                    <li key={g.id}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{g.title}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {g.current}/{g.target} {g.unit}
                        </span>
                      </div>
                      <div
                        className="mt-1 h-2 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${g.title} progress`}
                      >
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Study materials">
          {!a.studyMaterials.available ? (
            <Empty text="No saved study materials." />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{a.studyMaterials.data!.saved} saved.</p>
              <ul className="mt-2 space-y-1 text-sm">
                {a.studyMaterials.data!.recent.map((m) => (
                  <li key={m.id} className="truncate">
                    {m.title} <span className="text-muted-foreground">· {m.subject}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>

      {/* Campus + content activity */}
      <Panel title="Campus activity">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(report.usage).map(([key, section]) => (
            <div key={key} className="rounded-lg bg-muted/60 p-2.5">
              <p className="text-xs font-medium capitalize text-muted-foreground">
                {key.replace(/([A-Z])/g, " $1").toLowerCase()}
              </p>
              {section?.available && section.data ? (
                <p className="mt-0.5 text-lg font-bold tabular-nums">
                  {typeof section.data.total === "number"
                    ? section.data.total
                    : typeof section.data.distinct === "number"
                      ? section.data.distinct
                      : typeof section.data.sent === "number"
                        ? section.data.sent
                        : typeof section.data.activeSessions === "number"
                          ? section.data.activeSessions
                          : "—"}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">No data available</p>
              )}
            </div>
          ))}
        </div>
      </Panel>

      {!isSelf && (
        <p className="text-xs text-muted-foreground">
          You are viewing another student&apos;s report. This access is recorded in the audit log.
        </p>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <h2 className="font-semibold">{title}</h2>
        <div className="mt-2">{children}</div>
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground" role="status">
      {text}
    </p>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "emerald" | "red";
}) {
  return (
    <div className="rounded-lg bg-muted/60 p-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums",
          tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : tone === "red" ? "text-red-600 dark:text-red-400" : ""
        )}
      >
        {value}
      </p>
    </div>
  );
}

const CHIP: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  submitted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  passed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  graded: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  in_progress: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  submitted_pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  overdue: "bg-red-500/10 text-red-600 dark:text-red-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  not_started: "bg-muted text-muted-foreground",
};

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
        CHIP[status] ?? "bg-muted text-muted-foreground"
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
