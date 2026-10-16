"use client";

import { useCallback, useEffect, useState } from "react";
import { GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/Sheet";
import { apiErrorMessage, cn } from "@/lib/utils";
import {
  CourseDot, CourseSelect, Field, ProgressBar, countdown, inputCls, useCourses,
} from "@/components/academic/bits";

import type { ExamJSON as Exam } from "@/types";

type View = "upcoming" | "past" | "all";

export function ExamsClient() {
  const [view, setView] = useState<View>("upcoming");
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; exam: Exam | null }>({ open: false, exam: null });
  const courses = useCourses();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/exams?view=${view}&limit=100`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load exams");
      setExams(data.exams ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load exams");
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    // Initial + refetch on view change (fetch resolves async; safe here).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const remove = async (e: Exam) => {
    if (!confirm(`Delete "${e.title}"?`)) return;
    setExams((prev) => prev.filter((x) => x.id !== e.id));
    const snapshot = exams;
    setError(null);
    try {
      const res = await fetch(`/api/exams/${e.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Could not delete the exam"));
    } catch (err) {
      // Roll back so a failed delete never leaves the row silently missing.
      setExams(snapshot);
      setError(err instanceof Error ? err.message : "Could not delete the exam");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="dyne-page-title">Exams</h1>
          <p className="dyne-page-subtitle">Dates, topics, and preparation in one view.</p>
        </div>
        <Button onClick={() => setSheet({ open: true, exam: null })} className="min-h-[44px] rounded-xl">
          <Plus className="h-4 w-4" aria-hidden="true" /> New exam
        </Button>
      </div>

      <div className="mt-4 flex gap-1.5" role="tablist" aria-label="Exam views">
        {(["upcoming", "past", "all"] as View[]).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              "min-h-[44px] rounded-xl px-3.5 text-sm font-semibold capitalize",
              view === v ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <div className="dyne-card"><ErrorState title="Couldn't load exams" description={error} onRetry={() => void load()} /></div>
        ) : exams.length === 0 ? (
          <div className="dyne-card">
            <EmptyState
              icon={GraduationCap}
              title={view === "upcoming" ? "No upcoming exams" : "No exams here"}
              description="Add exam dates with topics and track preparation as the day approaches."
              actionLabel="Create exam"
              onAction={() => setSheet({ open: true, exam: null })}
            />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {exams.map((e) => {
              const cd = e.status === "scheduled" ? countdown(e.date) : null;
              const d = new Date(e.date);
              return (
                <li key={e.id} className="dyne-card p-3.5 sm:p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold">{e.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {e.course && (
                          <span className="inline-flex items-center gap-1">
                            <CourseDot color={e.course.color} /> {e.course.name}
                          </span>
                        )}
                        <span>{isNaN(+d) ? "" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{!isNaN(+d) && ` · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}</span>
                        {e.location && <span>· {e.location}</span>}
                      </p>
                      {cd && (
                        <p className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary" aria-label={`Countdown: ${cd}`}>
                          {cd}
                        </p>
                      )}
                      {e.topics.length > 0 && (
                        <p className="mt-1.5 flex flex-wrap gap-1">
                          {e.topics.map((t) => (
                            <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px]">{t}</span>
                          ))}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0">
                      <button onClick={() => setSheet({ open: true, exam: e })} aria-label={`Edit ${e.title}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button onClick={() => void remove(e)} aria-label={`Delete ${e.title}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-destructive">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="flex-1"><ProgressBar value={e.preparation} label={`${e.title} preparation`} /></div>
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">{e.preparation}% ready</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BottomSheet open={sheet.open} onClose={() => setSheet({ open: false, exam: null })} title={sheet.exam ? "Edit exam" : "New exam"}>
        <ExamForm
          key={sheet.exam?.id ?? "new"}
          exam={sheet.exam}
          courses={courses}
          onDone={() => { setSheet({ open: false, exam: null }); void load(); }}
        />
      </BottomSheet>
    </div>
  );
}

function ExamForm({ exam, courses, onDone }: {
  exam: Exam | null;
  courses: Array<{ id: string; name: string; color: string }>;
  onDone: () => void;
}) {
  const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
  const [title, setTitle] = useState(exam?.title ?? "");
  const [courseId, setCourseId] = useState(exam?.course_id ?? "");
  const [date, setDate] = useState(toLocal(exam?.date ?? null));
  const [location, setLocation] = useState(exam?.location ?? "");
  const [topics, setTopics] = useState((exam?.topics ?? []).join(", "));
  const [preparation, setPreparation] = useState(exam?.preparation ?? 0);
  const [notes, setNotes] = useState(exam?.notes ?? "");
  const [status, setStatus] = useState(exam?.status ?? "scheduled");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setErr("Give the exam a title."); return; }
    if (!date) { setErr("Pick the exam date and time."); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        title: title.trim(),
        courseId: courseId || null,
        date: new Date(date).toISOString(),
        location: location.trim() || null,
        topics: topics.split(",").map((t) => t.trim()).filter(Boolean),
        preparation,
        notes: notes.trim() || null,
        status,
      };
      const res = exam
        ? await fetch(`/api/exams/${exam.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/exams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not save the exam");
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save the exam");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Title" htmlFor="exam-title">
        <input id="exam-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} placeholder="e.g. Term 2 Physics final" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Course (optional)" htmlFor="exam-course">
          <CourseSelect id="exam-course" value={courseId} onChange={setCourseId} courses={courses} />
        </Field>
        <Field label="Date & time" htmlFor="exam-date">
          <input id="exam-date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Location (optional)" htmlFor="exam-location">
          <input id="exam-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} className={inputCls} placeholder="Hall B" />
        </Field>
        <Field label="Status" htmlFor="exam-status">
          <select id="exam-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputCls}>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
      </div>
      <Field label="Topics (optional, comma-separated)" htmlFor="exam-topics">
        <input id="exam-topics" value={topics} onChange={(e) => setTopics(e.target.value)} maxLength={500} className={inputCls} placeholder="Thermodynamics, Optics" />
      </Field>
      <Field label={`Preparation — ${preparation}%`} htmlFor="exam-prep">
        <input id="exam-prep" type="range" min={0} max={100} value={preparation} onChange={(e) => setPreparation(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
      </Field>
      <Field label="Notes (optional)" htmlFor="exam-notes">
        <Textarea id="exam-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={2} />
      </Field>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button type="submit" disabled={saving} className="min-h-[48px] w-full rounded-xl">
        {saving ? "Saving…" : exam ? "Save changes" : "Create exam"}
      </Button>
    </form>
  );
}
