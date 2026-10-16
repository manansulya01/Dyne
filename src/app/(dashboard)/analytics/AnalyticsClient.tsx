"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, ListTodo, ClipboardList, Timer, Target, Flame } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { CourseDot, formatMinutes } from "@/components/academic/bits";

interface Analytics {
  range_days: number;
  tasks: { created: number; completed: number; completion_rate: number | null };
  assignments: { completed: number; open: number; total: number };
  study: {
    total_seconds: number;
    by_course: Array<{ course_id: string | null; name: string; color: string; study_seconds: number }>;
    daily: Array<{ date: string; study_seconds: number }>;
  };
  goals: { active: number; completed: number; total: number };
  habits: { completions: number; expected: number; consistency_rate: number | null; active_count: number };
  workload: Array<{
    course_id: string | null; name: string; color: string;
    open_tasks: number; open_assignments: number; upcoming_exams: number;
  }>;
}

export function AnalyticsClient() {
  const [range, setRange] = useState<7 | 14 | 30>(7);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?range=${range}`);
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load analytics");
      setData(json.analytics as Analytics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    // Initial + refetch on range change (fetch resolves async; safe here).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const maxDaily = Math.max(1, ...(data?.study.daily.map((d) => d.study_seconds) ?? [0]));
  const maxCourse = Math.max(1, ...(data?.study.by_course.map((c) => c.study_seconds) ?? [0]));
  const hasAnything = data && (
    data.tasks.created > 0 || data.assignments.total > 0 || data.study.total_seconds > 0 ||
    data.goals.total > 0 || data.habits.active_count > 0
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pb-6 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="dyne-page-title">Analytics</h1>
          <p className="dyne-page-subtitle">Your real study footprint — nothing invented.</p>
        </div>
        <div className="flex gap-1.5" role="tablist" aria-label="Time range">
          {([7, 14, 30] as const).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={cn(
                "min-h-[44px] rounded-xl px-3.5 text-sm font-semibold",
                range === r ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
              )}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4" aria-live="polite">
        {loading ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <div className="dyne-card"><ErrorState title="Couldn't load analytics" description={error} onRetry={() => void load()} /></div>
        ) : !data || !hasAnything ? (
          <div className="dyne-card">
            <EmptyState
              icon={BarChart3}
              title="No data yet"
              description="Complete tasks, finish study sessions, and log habits — your analytics will appear here across 7, 14, and 30 days."
            />
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat icon={ListTodo} label="Tasks done" value={String(data.tasks.completed)} sub={data.tasks.completion_rate !== null ? `${data.tasks.completion_rate}% of created` : "None created"} href="/tasks" />
              <Stat icon={ClipboardList} label="Assignments done" value={String(data.assignments.completed)} sub={`${data.assignments.open} still open`} href="/assignments" />
              <Stat icon={Timer} label="Study time" value={formatMinutes(data.study.total_seconds)} sub={`Last ${data.range_days} days`} href="/study-sessions" />
              <Stat icon={Target} label="Active goals" value={String(data.goals.active)} sub={`${data.goals.completed} completed`} href="/goals" />
            </dl>

            <section aria-label="Study time per day" className="dyne-card p-4 sm:p-5">
              <h2 className="dyne-section-title">Study time per day</h2>
              {data.study.total_seconds === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No sessions in this period yet.</p>
              ) : (
                <div className="mt-3 flex h-36 items-end gap-1.5" role="img" aria-label={`Daily study minutes: ${data.study.daily.map((d) => `${d.date} ${Math.round(d.study_seconds / 60)} minutes`).join(", ")}`}>
                  {data.study.daily.map((d) => (
                    <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${d.date}: ${formatMinutes(d.study_seconds)}`}>
                      <div
                        className="w-full rounded-t-md bg-primary/80"
                        style={{ height: `${Math.max(3, Math.round((d.study_seconds / maxDaily) * 120))}px` }}
                      />
                      <span className="text-[10px] text-muted-foreground">{d.date.slice(8)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section aria-label="Study by course" className="dyne-card p-4 sm:p-5">
                <h2 className="dyne-section-title">Study by course</h2>
                {data.study.by_course.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No study time recorded.</p>
                ) : (
                  <ul className="mt-3 space-y-2.5">
                    {data.study.by_course.map((c) => (
                      <li key={c.course_id ?? "none"}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-1.5 font-medium">
                            <CourseDot color={c.color} /> <span className="truncate">{c.name}</span>
                          </span>
                          <span className="shrink-0 font-bold tabular-nums">{formatMinutes(c.study_seconds)}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round((c.study_seconds / maxCourse) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.name} share`}>
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(c.study_seconds / maxCourse) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-label="Habits and workload" className="space-y-4">
                <div className="dyne-card p-4 sm:p-5">
                  <h2 className="dyne-section-title flex items-center gap-2"><Flame className="h-5 w-5 text-amber-500" aria-hidden="true" /> Habit consistency</h2>
                  {data.habits.active_count === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">No active habits. <Link href="/habits" className="font-medium text-primary hover:underline">Create one</Link>.</p>
                  ) : (
                    <p className="mt-2 text-sm">
                      <span className="text-2xl font-extrabold tabular-nums">{data.habits.consistency_rate ?? 0}%</span>
                      <span className="text-muted-foreground"> · {data.habits.completions} check-ins of {data.habits.expected} expected</span>
                    </p>
                  )}
                </div>
                <div className="dyne-card p-4 sm:p-5">
                  <h2 className="dyne-section-title">Course workload</h2>
                  {data.workload.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Nothing open anywhere. Enjoy it.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {data.workload.slice(0, 6).map((w) => (
                        <li key={w.course_id ?? "none"} className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">
                          <CourseDot color={w.color} />
                          <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {w.open_tasks + w.open_assignments + w.upcoming_exams} open
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, href }: {
  icon: typeof ListTodo; label: string; value: string; sub: string; href: string;
}) {
  return (
    <Link href={href} className="dyne-card dyne-card-hover block p-4">
      <dt className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" /> {label}
      </dt>
      <dd className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">{value}</dd>
      <dd className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</dd>
    </Link>
  );
}
