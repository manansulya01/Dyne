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

export function CalendarClient() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [timetable, setTimetable] = useState<Array<{ dayOfWeek: number; subject: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [filter, setFilter] = useState<"all" | "events" | "classes">("all");
  const [selected, setSelected] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sched, tt] = await Promise.all([
          fetch("/api/schedule?limit=50").then((r) => r.json()),
          fetch("/api/timetable").then((r) => (r.ok ? r.json() : { entries: [] })),
        ]);
        if (cancelled) return;
        setEvents((sched.events ?? []).map((e: Record<string, unknown>) => ({ id: String(e.id), title: String(e.title), start_time: String(e.start_time) })));
        setTimetable((tt.entries ?? []).map((t: Record<string, unknown>) => ({ dayOfWeek: Number(t.dayOfWeek), subject: String(t.subject) })));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load calendar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);
  const leadBlanks = startOfMonth(month).getDay();
  const selectedEvents = selected ? events.filter((e) => isSameDay(parseISO(e.start_time), selected)) : [];
  const selectedClasses = selected ? timetable.filter((t) => t.dayOfWeek === selected.getDay()) : [];

  if (loading) return <div className="mx-auto max-w-3xl space-y-3 p-4"><ListSkeleton rows={5} /></div>;
  if (error) return <div className="mx-auto max-w-3xl p-4"><div className="dyne-card"><ErrorState title="Couldn't load calendar" description={error} onRetry={() => window.location.reload()} /></div></div>;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-4">
      <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
        <CalendarDays className="h-6 w-6 text-primary" aria-hidden="true" /> Calendar
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">Classes and events together — filterable at a glance.</p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="min-h-[44px] rounded-xl border border-border px-4 text-sm font-medium" aria-label="Previous month">←</button>
          <p className="flex min-h-[44px] items-center px-2 text-sm font-bold" aria-live="polite">{format(month, "MMMM yyyy")}</p>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="min-h-[44px] rounded-xl border border-border px-4 text-sm font-medium" aria-label="Next month">→</button>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Calendar filters">
          {(["all", "events", "classes"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`min-h-[40px] rounded-lg px-3 text-xs font-semibold capitalize ${filter === f ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="dyne-card mt-3 grid grid-cols-7 gap-1 p-3" role="grid" aria-label="Month calendar">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="pb-1 text-center text-[11px] font-bold text-muted-foreground">{d}</span>
        ))}
        {Array.from({ length: leadBlanks }).map((_, i) => <span key={`b${i}`} />)}
        {days.map((d) => {
          const dayEvents = filter === "classes" ? [] : events.filter((e) => isSameDay(parseISO(e.start_time), d));
          const dayClasses = filter === "events" ? [] : timetable.filter((t) => t.dayOfWeek === d.getDay());
          const has = dayEvents.length > 0 || dayClasses.length > 0;
          const isSel = selected ? isSameDay(d, selected) : false;
          return (
            <button
              key={d.toISOString()}
              role="gridcell"
              aria-selected={isSel}
              onClick={() => setSelected(d)}
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl text-sm ${isSel ? "bg-primary font-bold text-primary-foreground" : has ? "bg-muted font-semibold hover:bg-muted/70" : "hover:bg-muted"}`}
            >
              {format(d, "d")}
              {has && !isSel && <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="dyne-card mt-3 p-4" aria-live="polite">
          <h2 className="text-sm font-bold">{format(selected, "EEEE, MMM d")}</h2>
          {selectedEvents.length === 0 && selectedClasses.length === 0 && (
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
          </ul>
        </div>
      )}
    </div>
  );
}
