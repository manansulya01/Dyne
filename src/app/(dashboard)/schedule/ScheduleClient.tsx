"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Megaphone, CalendarDays, Table2 } from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EventCard } from "@/components/cards/EntityCards";
import { format, parseISO } from "date-fns";

interface ScheduleData {
  events: Array<Record<string, unknown>>;
  announcements: Array<Record<string, unknown>>;
  timetable: Array<Record<string, unknown>>;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ScheduleClient() {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"today" | "week" | "all">("today");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/schedule?limit=30");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load schedule");
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load schedule");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="mx-auto max-w-3xl p-4"><div className="dyne-card"><ErrorState title="Couldn't load schedule" description={error} onRetry={() => window.location.reload()} /></div></div>;
  if (!data) return <div className="mx-auto max-w-3xl space-y-3 p-4"><ListSkeleton rows={4} /></div>;

  const todayIdx = new Date().getDay();
  const todayTable = data.timetable.filter((t) => Number(t.dayOfWeek) === todayIdx);
  const events = data.events as Array<Record<string, unknown>>;
  const todayEvents = events.filter((e) => {
    const d = parseISO(String(e.start_time ?? (e as Record<string, unknown>).startTime));
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const shownEvents = view === "today" ? todayEvents : events;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-4">
      <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
        <CalendarClock className="h-6 w-6 text-primary" aria-hidden="true" /> Schedule
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">Today, this week, and what&apos;s next — classes, events, and announcements in one hub.</p>

      <div className="mt-4">
        <SegmentedControl
          label="Schedule range"
          value={view}
          onChange={setView}
          options={[
            { value: "today", label: "Today" },
            { value: "week", label: "Upcoming" },
            { value: "all", label: "Calendar" },
          ]}
        />
      </div>

      {data.announcements.length > 0 && (
        <section aria-label="Announcements" className="mt-4 space-y-2">
          {data.announcements.slice(0, 3).map((a) => (
            <div key={String(a.id)} className="dyne-card flex items-start gap-3 border-l-4 border-l-primary p-4">
              <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{String(a.title)}</p>
                <p className="dyne-line-2 text-sm text-muted-foreground">{String(a.body)}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      <section aria-label="Today's classes" className="mt-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold"><Table2 className="h-5 w-5 text-primary" aria-hidden="true" /> Today · {DAYS[todayIdx]}</h2>
        {todayTable.length === 0 ? (
          <div className="dyne-card"><EmptyState icon={Table2} title="No classes scheduled today" description="The timetable is empty for today. Admins and staff can add periods from the admin area." actionLabel="View timetable" onAction={() => (window.location.href = "/timetable")} /></div>
        ) : (
          <ol className="space-y-2">
            {todayTable.map((t) => (
              <li key={String(t.id)} className="dyne-card flex items-center gap-3 p-3.5">
                <span className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">{String(t.startTime)} – {String(t.endTime)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{String(t.subject)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[t.room, t.teacher].filter(Boolean).join(" · ") || "MVA"}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Events" className="mt-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold"><CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" /> {view === "today" ? "Today's events" : "Upcoming events"}</h2>
        {shownEvents.length === 0 ? (
          <div className="dyne-card"><EmptyState icon={CalendarDays} title="No events here" description="Try the Upcoming range, or discover everything on the events page." /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {shownEvents.slice(0, view === "today" ? 4 : 10).map((e) => (
              <EventCard
                key={String(e.id)}
                event={{
                  id: String(e.id),
                  title: String(e.title),
                  description: (e.description as string | null) ?? null,
                  image_url: ((e.image_url ?? null) as string | null),
                  start_time: String(e.start_time),
                  end_time: String(e.end_time),
                  attendee_count: Number(e.attendee_count ?? 0),
                  location_name: (e.location as Record<string, unknown> | null)?.name as string | undefined ?? (e.locationName as Record<string, unknown> | null)?.name as string | undefined ?? null,
                }}
              />
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Link href="/events" className="text-sm font-medium text-primary">All events →</Link>
          <Link href="/calendar" className="text-sm font-medium text-primary">Open calendar →</Link>
          <Link href="/timetable" className="text-sm font-medium text-primary">Weekly timetable →</Link>
        </div>
      </section>

      {view === "all" && (
        <section aria-label="Week overview" className="mt-6">
          <h2 className="mb-2 text-base font-bold">This week at a glance</h2>
          <div className="grid gap-2 sm:grid-cols-7">
            {DAYS.map((d, i) => {
              const n = data.timetable.filter((t) => Number(t.dayOfWeek) === i).length;
              return (
                <div key={d} className="dyne-card p-3 text-center">
                  <p className="text-xs font-semibold">{d.slice(0, 3)}</p>
                  <p className="mt-1 text-lg font-bold">{n}</p>
                  <p className="text-[11px] text-muted-foreground">{n === 1 ? "period" : "periods"}</p>
                </div>
              );
            })}
          </div>
          {events.length > 0 && (
            <ol className="mt-3 space-y-2">
              {events.slice(0, 8).map((e) => (
                <li key={String(e.id)} className="dyne-card flex items-center gap-3 p-3">
                  <span className="w-20 shrink-0 text-xs font-semibold text-muted-foreground">{format(parseISO(String(e.start_time)), "MMM d")}</span>
                  <Link href={`/events/${String(e.id)}`} className="truncate text-sm font-medium hover:underline">{String(e.title)}</Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
