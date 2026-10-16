"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/EmptyState";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";

interface CalEvent {
  id: string;
  title: string;
  start_time: string;
}

interface StudyItem {
  id: string;
  title: string;
  date: string;
  kind: "task" | "assignment" | "exam";
  href: string;
}

const KIND_STYLE: Record<StudyItem["kind"], { label: string; dot: string; chip: string }> = {
  task: { label: "TASK", dot: "bg-blue-500", chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  assignment: { label: "ASSIGNMENT", dot: "bg-violet-500", chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  exam: { label: "EXAM", dot: "bg-red-500", chip: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

export function CalendarClient() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [timetable, setTimetable] = useState<Array<{ dayOfWeek: number; subject: string }>>([]);
  const [study, setStudy] = useState<StudyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [filter, setFilter] = useState<"all" | "events" | "classes" | "study">("all");
  const [selected, setSelected] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const from = startOfMonth(month).toISOString();
        const to = endOfMonth(month).toISOString();
        const [sched, tt, tasks, assignments, exams] = await Promise.all([
          fetch("/api/schedule?limit=50").then((r) => r.json()),
          fetch("/api/timetable").then((r) => (r.ok ? r.json() : { entries: [] })),
          fetch(`/api/tasks?view=all&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`).then((r) => (r.ok ? r.json() : { tasks: [] })).catch(() => ({ tasks: [] })),
          fetch(`/api/assignments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`).then((r) => (r.ok ? r.json() : { assignments: [] })).catch(() => ({ assignments: [] })),
          fetch(`/api/exams?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`).then((r) => (r.ok ? r.json() : { exams: [] })).catch(() => ({ exams: [] })),
        ]);
        if (cancelled) return;
        setEvents((sched.events ?? []).map((e: Record<string, unknown>) => ({ id: String(e.id), title: String(e.title), start_time: String(e.start_time) })));
        setTimetable((tt.entries ?? []).map((t: Record<string, unknown>) => ({ dayOfWeek: Number(t.dayOfWeek), subject: String(t.subject) })));
        const items: StudyItem[] = [
          ...((tasks.tasks ?? []) as Array<Record<string, unknown>>)
            .filter((t) => t.due_date && !t.completed_at)
            .map((t) => ({ id: String(t.id), title: String(t.title), date: String(t.due_date), kind: "task" as const, href: "/tasks" })),
          ...((assignments.assignments ?? []) as Array<Record<string, unknown>>)
            .filter((a) => a.due_date && a.status !== "completed")
            .map((a) => ({ id: String(a.id), title: String(a.title), date: String(a.due_date), kind: "assignment" as const, href: "/assignments" })),
          ...((exams.exams ?? []) as Array<Record<string, unknown>>)
            .filter((e) => e.date && e.status === "scheduled")
            .map((e) => ({ id: String(e.id), title: String(e.title), date: String(typeof e.date === "string" ? e.date : ""), kind: "exam" as const, href: "/exams" })),
        ];
        setStudy(items);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load calendar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month]);

  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);
  const leadBlanks = startOfMonth(month).getDay();
  const showEvents = filter === "all" || filter === "events";
  const showClasses = filter === "all" || filter === "classes";
  const showStudy = filter === "all" || filter === "study";
  const selectedEvents = selected && showEvents ? events.filter((e) => isSameDay(parseISO(e.start_time), selected)) : [];
  const selectedClasses = selected && showClasses ? timetable.filter((t) => t.dayOfWeek === selected.getDay()) : [];
  const selectedStudy = selected && showStudy ? study.filter((s) => { try { return isSameDay(parseISO(s.date), selected); } catch { return false; } }) : [];

  if (loading) return <div className="mx-auto max-w-3xl space-y-3 p-4"><ListSkeleton rows={5} /></div>;
  if (error) return <div className="mx-auto max-w-3xl p-4"><div className="dyne-card"><ErrorState title="Couldn't load calendar" description={error} onRetry={() => window.location.reload()} /></div></div>;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-4">
      <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
        <CalendarDays className="h-6 w-6 text-primary" aria-hidden="true" /> Calendar
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">Classes, events, tasks, assignments, and exams — one view.</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="min-h-[44px] rounded-xl border border-border px-4 text-sm font-medium" aria-label="Previous month">←</button>
          <p className="flex min-h-[44px] items-center px-2 text-sm font-bold" aria-live="polite">{format(month, "MMMM yyyy")}</p>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="min-h-[44px] rounded-xl border border-border px-4 text-sm font-medium" aria-label="Next month">→</button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Calendar filters">
          {(["all", "events", "classes", "study"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`min-h-[44px] rounded-lg px-3 text-xs font-semibold capitalize ${filter === f ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="Legend">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" /> Event</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground" aria-hidden="true" /> Class</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" /> Task</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-500" aria-hidden="true" /> Assignment</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" /> Exam</span>
      </div>

      <div className="dyne-card mt-3 grid grid-cols-7 gap-1 p-3" role="grid" aria-label="Month calendar">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="pb-1 text-center text-[11px] font-bold text-muted-foreground">{d}</span>
        ))}
        {Array.from({ length: leadBlanks }).map((_, i) => <span key={`b${i}`} />)}
        {days.map((d) => {
          const dayEvents = showEvents ? events.filter((e) => isSameDay(parseISO(e.start_time), d)) : [];
          const dayClasses = showClasses ? timetable.filter((t) => t.dayOfWeek === d.getDay()) : [];
          const dayStudy = showStudy ? study.filter((s) => { try { return isSameDay(parseISO(s.date), d); } catch { return false; } }) : [];
          const dots: string[] = [
            ...(dayEvents.length > 0 ? ["bg-primary"] : []),
            ...(dayClasses.length > 0 ? ["bg-muted-foreground"] : []),
            ...(dayStudy.some((s) => s.kind === "task") ? ["bg-blue-500"] : []),
            ...(dayStudy.some((s) => s.kind === "assignment") ? ["bg-violet-500"] : []),
            ...(dayStudy.some((s) => s.kind === "exam") ? ["bg-red-500"] : []),
          ];
          const has = dots.length > 0;
          const isSel = selected ? isSameDay(d, selected) : false;
          return (
            <button
              key={d.toISOString()}
              role="gridcell"
              aria-selected={isSel}
              aria-label={`${format(d, "MMMM d")}${has ? `, ${dayEvents.length + dayClasses.length + dayStudy.length} items` : ""}`}
              onClick={() => setSelected(d)}
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl text-sm ${isSel ? "bg-primary font-bold text-primary-foreground" : has ? "bg-muted font-semibold hover:bg-muted/70" : "hover:bg-muted"}`}
            >
              {format(d, "d")}
              {has && !isSel && (
                <span className="mt-0.5 flex gap-0.5" aria-hidden="true">
                  {dots.slice(0, 4).map((c, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${c}`} />)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="dyne-card mt-3 p-4" aria-live="polite">
          <h2 className="text-sm font-bold">{format(selected, "EEEE, MMM d")}</h2>
          {selectedEvents.length === 0 && selectedClasses.length === 0 && selectedStudy.length === 0 && (
            <p className="mt-1 text-sm text-muted-foreground">Nothing scheduled this day.</p>
          )}
          <ul className="mt-2 space-y-1.5">
            {selectedClasses.map((c, i) => (
              <li key={`c${i}`} className="text-sm"><span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-bold">CLASS</span>{c.subject}</li>
            ))}
            {selectedEvents.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="mr-2 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-bold text-primary">EVENT</span>
                <Link href={`/events/${e.id}`} className="font-medium hover:underline">{e.title}</Link>
              </li>
            ))}
            {selectedStudy.map((s) => (
              <li key={`${s.kind}${s.id}`} className="text-sm">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-bold ${KIND_STYLE[s.kind].chip}`}>{KIND_STYLE[s.kind].label}</span>
                <Link href={s.href} className="font-medium hover:underline">{s.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
