"use client";

import { useEffect, useMemo, useState } from "react";
import { Table2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";

interface Entry {
  id: string;
  dayOfWeek: number;
  periodIndex: number;
  startTime: string;
  endTime: string;
  subject: string;
  room: string | null;
  teacher: string | null;
  classGrade: string | null;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}
function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function TimetableClient({ canEdit }: { canEdit: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<number>(() => new Date().getDay());
  const [form, setForm] = useState({ startTime: "09:00", endTime: "09:50", subject: "", room: "", teacher: "", classGrade: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/timetable");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load timetable");
      setEntries(json.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load timetable");
    } finally {
      setLoading(false);
    }
  };

  // Initial timetable load only.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const dayEntries = useMemo(
    () => entries.filter((e) => e.dayOfWeek === day).sort((a, b) => a.periodIndex - b.periodIndex || a.startTime.localeCompare(b.startTime)),
    [entries, day]
  );
  const mins = nowMinutes();
  const isToday = day === new Date().getDay();
  const currentIdx = isToday ? dayEntries.findIndex((e) => mins >= toMin(e.startTime) && mins < toMin(e.endTime)) : -1;
  const nextIdx = isToday ? dayEntries.findIndex((e) => toMin(e.startTime) > mins) : -1;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const maxPeriod = dayEntries.reduce((m, x) => Math.max(m, x.periodIndex), -1);
      const res = await fetch("/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: day,
          periodIndex: maxPeriod + 1,
          startTime: form.startTime,
          endTime: form.endTime,
          subject: form.subject,
          room: form.room || undefined,
          teacher: form.teacher || undefined,
          classGrade: form.classGrade || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const first = typeof json.error === "string" ? json.error : Object.values(json.error ?? {})[0];
        throw new Error(Array.isArray(first) ? first[0] : String(first ?? "Failed to save"));
      }
      setForm({ startTime: "09:00", endTime: "09:50", subject: "", room: "", teacher: "", classGrade: "" });
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const clearDay = async () => {
    if (!confirm(`Clear all periods on ${DAYS[day]}?`)) return;
    // Clear is scoped server-side by classGrade only; for day scoping we
    // delete via repeated admin clears is overkill — instead inform.
    // Minimal honest approach: full clear requires confirmation.
    if (!confirm("This clears the whole timetable. Continue?")) return;
    await fetch("/api/timetable", { method: "DELETE" });
    await load();
  };

  if (loading) return <div className="mx-auto max-w-3xl space-y-3 p-4"><ListSkeleton rows={5} /></div>;
  if (error) return <div className="mx-auto max-w-3xl p-4"><div className="dyne-card"><ErrorState title="Couldn't load timetable" description={error} onRetry={load} /></div></div>;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-4">
      <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
        <Table2 className="h-6 w-6 text-primary" aria-hidden="true" /> Timetable
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">Days, periods, subjects, rooms, and teachers — with the current period highlighted.</p>

      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Day of week">
        {DAYS.map((d, i) => (
          <button
            key={d}
            role="tab"
            aria-selected={day === i}
            onClick={() => setDay(i)}
            className={`min-h-[44px] shrink-0 rounded-xl px-3.5 text-sm font-medium ${day === i ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"}`}
          >
            {d.slice(0, 3)}
          </button>
        ))}
      </div>

      {dayEntries.length === 0 ? (
        <div className="dyne-card mt-3">
          <EmptyState icon={Table2} title={`No periods on ${DAYS[day]} yet`} description="Timetable data is entered by staff — never invented. When periods are added, they appear here with rooms and teachers." />
        </div>
      ) : (
        <ol className="mt-3 space-y-2">
          {dayEntries.map((e, i) => {
            const isCurrent = i === currentIdx;
            const isNext = i === nextIdx && currentIdx === -1;
            return (
              <li key={e.id} className={`dyne-card flex items-center gap-3 p-3.5 ${isCurrent ? "border-2 border-primary" : ""}`} aria-current={isCurrent ? "time" : undefined}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-bold">{e.periodIndex + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {e.subject}
                    {isCurrent && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">Now</span>}
                    {isNext && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Next</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {e.startTime} – {e.endTime}{e.room ? ` · Room ${e.room}` : ""}{e.teacher ? ` · ${e.teacher}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {canEdit && (
        <form onSubmit={add} className="dyne-card mt-4 space-y-3 p-4" aria-label="Add timetable period">
          <h2 className="flex items-center gap-2 text-sm font-bold"><Plus className="h-4 w-4" /> Add period · {DAYS[day]}</h2>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="tt-start" className="text-xs font-medium">Start</label><Input id="tt-start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required /></div>
            <div><label htmlFor="tt-end" className="text-xs font-medium">End</label><Input id="tt-end" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required /></div>
          </div>
          <div><label htmlFor="tt-subject" className="text-xs font-medium">Subject</label><Input id="tt-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required maxLength={100} placeholder="Mathematics" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="tt-room" className="text-xs font-medium">Room</label><Input id="tt-room" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} maxLength={50} placeholder="B-12" /></div>
            <div><label htmlFor="tt-teacher" className="text-xs font-medium">Teacher</label><Input id="tt-teacher" value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} maxLength={100} /></div>
          </div>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving} className="flex-1">{saving ? "Saving…" : "Add period"}</Button>
            <Button type="button" variant="outline" onClick={clearDay} aria-label="Clear timetable"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </form>
      )}
    </div>
  );
}
