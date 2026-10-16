"use client";

import { useCallback, useEffect, useState } from "react";
import { Pause, Play, Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { CourseDot, CourseSelect, Field, formatClock, formatMinutes, inputCls, useCourses } from "@/components/academic/bits";

import type { StudySessionJSON as Session } from "@/types";

export function StudySessionsClient() {
  const [active, setActive] = useState<Session | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Server-sync instant (state, not a ref: it is read during render for the
  // live elapsed display, and refs must not be read during render).
  const [syncedAtMs, setSyncedAtMs] = useState(0);
  const courses = useCourses();

  const load = useCallback(async () => {
    try {
      const [a, h] = await Promise.all([
        fetch("/api/study-sessions?status=active&limit=5").then((r) => r.json()).catch(() => null),
        fetch("/api/study-sessions?limit=20").then((r) => r.json()).catch(() => null),
      ]);
      // Active OR paused session (single in-progress session at most).
      const current = [...(a?.sessions ?? []), ...(h?.sessions ?? []).filter((s: Session) => s.status === "paused")]
        .find((s: Session) => s.status === "active" || s.status === "paused") ?? null;
      setActive(current);
      setSyncedAtMs(Date.now());
      setHistory((h?.sessions ?? []).filter((s: Session) => s.status === "completed" || s.status === "cancelled"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load + live clock + periodic server re-sync (server is source
    // of truth; sync keeps refresh/reconnect and multi-device use truthful).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const clock = setInterval(() => setNowMs(Date.now()), 1000);
    const sync = setInterval(() => void load(), 30000);
    return () => { clearInterval(clock); clearInterval(sync); };
  }, [load]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/study-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: courseId || null, subject: subject.trim() || null, note: note.trim() || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not start the session");
      setSubject("");
      setNote("");
      await load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Could not start the session");
    } finally {
      setStarting(false);
    }
  };

  const act = async (action: "pause" | "resume" | "finish" | "cancel") => {
    if (!active) return;
    if (action === "finish" || action === "cancel") {
      if (!confirm(action === "finish" ? "Finish this session?" : "Discard this session?")) return;
    }
    try {
      const res = await fetch(`/api/study-sessions/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      await load();
    }
  };

  // Live elapsed: server duration at last sync + client tick while running
  // (frozen while paused). Server remains the source of truth. All inputs
  // are state (render-pure); no refs or impure clocks are read here.
  const elapsed = active
    ? active.duration_seconds + (active.status === "active" ? Math.max(0, Math.floor((nowMs - syncedAtMs) / 1000)) : 0)
    : 0;

  const todaySecs = history
    .filter((s) => new Date(s.started_at).toDateString() === new Date(nowMs).toDateString())
    .reduce((sum, s) => sum + s.duration_seconds, 0);
  const weekSecs = history
    .filter((s) => nowMs - new Date(s.started_at).getTime() < 7 * 86400000)
    .reduce((sum, s) => sum + s.duration_seconds, 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-4">
      <div>
        <h1 className="dyne-page-title">Study Sessions</h1>
        <p className="dyne-page-subtitle">A truthful timer — pause-aware, refresh-safe.</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3" aria-label="Study totals">
        <div className="dyne-card p-4">
          <p className="text-[13px] font-medium text-muted-foreground">Studied today</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{formatMinutes(todaySecs)}</p>
        </div>
        <div className="dyne-card p-4">
          <p className="text-[13px] font-medium text-muted-foreground">Last 7 days</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{formatMinutes(weekSecs)}</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-4"><ListSkeleton rows={3} /></div>
      ) : error && !active ? (
        <div className="dyne-card mt-4"><ErrorState title="Couldn't load sessions" description={error} onRetry={() => void load()} /></div>
      ) : active ? (
        <section aria-label="Current session" aria-live="polite" className="dyne-card mt-4 p-5 text-center">
          <p className="dyne-eyebrow">{active.status === "paused" ? "Paused" : "Now studying"}</p>
          <p className="mt-2 text-5xl font-extrabold tabular-nums tracking-tight" aria-label={`Elapsed ${formatClock(elapsed)}`}>
            {formatClock(elapsed)}
          </p>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            {active.course && (
              <span className="inline-flex items-center gap-1 font-medium">
                <CourseDot color={active.course.color} /> {active.course.name}
              </span>
            )}
            {active.subject && <span>· {active.subject}</span>}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {active.status === "active" ? (
              <Button variant="outline" className="min-h-[48px] rounded-xl px-6" onClick={() => void act("pause")}>
                <Pause className="h-4 w-4" aria-hidden="true" /> Pause
              </Button>
            ) : (
              <Button className="min-h-[48px] rounded-xl px-6" onClick={() => void act("resume")}>
                <Play className="h-4 w-4" aria-hidden="true" /> Resume
              </Button>
            )}
            <Button className="min-h-[48px] rounded-xl px-6" onClick={() => void act("finish")}>
              <Square className="h-4 w-4" aria-hidden="true" /> Finish
            </Button>
            <Button variant="ghost" className="min-h-[48px] rounded-xl" onClick={() => void act("cancel")}>
              Discard
            </Button>
          </div>
        </section>
      ) : (
        <section aria-label="Start a session" className="dyne-card mt-4 p-4 sm:p-5">
          <h2 className="dyne-section-title flex items-center gap-2"><Timer className="h-5 w-5 text-primary" aria-hidden="true" /> Start studying</h2>
          <form onSubmit={start} className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Course (optional)" htmlFor="ss-course">
                <CourseSelect id="ss-course" value={courseId} onChange={setCourseId} courses={courses} />
              </Field>
              <Field label="Subject (optional)" htmlFor="ss-subject">
                <input id="ss-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={100} className={inputCls} placeholder="e.g. Thermodynamics" />
              </Field>
            </div>
            <Field label="Session goal (optional)" htmlFor="ss-note">
              <Textarea id="ss-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} placeholder="What will you finish this session?" />
            </Field>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={starting} className="min-h-[48px] w-full rounded-xl">
              <Play className="h-4 w-4" aria-hidden="true" /> {starting ? "Starting…" : "Start session"}
            </Button>
          </form>
        </section>
      )}

      <section aria-label="Recent sessions" className="mt-5">
        <h2 className="dyne-section-title">Recent sessions</h2>
        {history.length === 0 ? (
          <div className="dyne-card mt-2">
            {active ? (
              // The timer is already running, so do not tell the user to start it.
              <EmptyState
                icon={Timer}
                title="Nothing finished yet"
                description="Your current session is still running above. Finish or discard it and it will appear here."
              />
            ) : (
              <EmptyState icon={Timer} title="No sessions yet" description="Start the timer above — every finished session lands here and feeds analytics." />
            )}
          </div>
        ) : (
          <ul className="dyne-card mt-2 divide-y divide-border overflow-hidden">
            {history.slice(0, 10).map((s) => (
              <li key={s.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {s.course && <CourseDot color={s.course.color} />}
                    <span className="truncate">{s.subject || s.course?.name || "Study session"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {s.status === "cancelled" ? " · discarded" : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums">{formatMinutes(s.duration_seconds)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Only finished sessions count toward totals and analytics.</p>
      </section>
    </div>
  );
}
