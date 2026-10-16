"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/Sheet";
import { CourseDot, COURSE_COLORS, Field, inputCls } from "@/components/academic/bits";
import { apiErrorMessage, cn } from "@/lib/utils";

import type { CourseJSON as Course } from "@/types";

export function CoursesClient() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; course: Course | null }>({ open: false, course: null });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/courses?counts=1&limit=100");
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load courses");
      setCourses(data.courses ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial courses load only (fetch resolves async; safe here).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const remove = async (c: Course) => {
    if (!confirm(`Delete "${c.name}"? Linked tasks keep existing, unlinked.`)) return;
    const snapshot = courses;
    setCourses((prev) => prev.filter((x) => x.id !== c.id));
    setError(null);
    try {
      const res = await fetch(`/api/courses/${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Could not delete the course"));
    } catch (e) {
      // Roll back: a failed delete must not leave the row vanished with no feedback.
      setCourses(snapshot);
      setError(e instanceof Error ? e.message : "Could not delete the course");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pb-6 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="dyne-page-title">Courses</h1>
          <p className="dyne-page-subtitle">Your subjects, organized in one place.</p>
        </div>
        <Button onClick={() => setSheet({ open: true, course: null })} className="min-h-[44px] rounded-xl">
          <Plus className="h-4 w-4" aria-hidden="true" /> New course
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <div className="dyne-card"><ErrorState title="Couldn't load courses" description={error} onRetry={() => void load()} /></div>
        ) : courses.length === 0 ? (
          <div className="dyne-card">
            <EmptyState
              icon={BookOpen}
              title="No courses yet"
              description="Add the subjects you're taking — assignments, exams, and notes attach to them."
              actionLabel="Create course"
              onAction={() => setSheet({ open: true, course: null })}
            />
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {courses.map((c) => {
              const open = (c.counts?.open_tasks ?? 0) + (c.counts?.open_assignments ?? 0) + (c.counts?.upcoming_exams ?? 0);
              return (
                <li key={c.id} className="dyne-card dyne-card-hover p-4">
                  <div className="flex items-start gap-2.5">
                    <Link href={`/courses/${c.id}`} className="min-w-0 flex-1" aria-label={`Open ${c.name}`}>
                      <p className="flex items-center gap-2 truncate text-[15px] font-bold">
                        <CourseDot color={c.color} /> <span className="truncate">{c.name}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[c.code, c.instructor, c.semester].filter(Boolean).join(" · ") || "No details yet"}
                      </p>
                      <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                        {open === 0 ? "All clear" : `${open} open item${open === 1 ? "" : "s"}`}
                        {c.counts && c.counts.notes > 0 ? ` · ${c.counts.notes} note${c.counts.notes === 1 ? "" : "s"}` : ""}
                      </p>
                    </Link>
                    <div className="flex shrink-0">
                      <button onClick={() => setSheet({ open: true, course: c })} aria-label={`Edit ${c.name}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button onClick={() => void remove(c)} aria-label={`Delete ${c.name}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-destructive">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BottomSheet open={sheet.open} onClose={() => setSheet({ open: false, course: null })} title={sheet.course ? "Edit course" : "New course"}>
        <CourseForm
          key={sheet.course?.id ?? "new"}
          course={sheet.course}
          onDone={() => { setSheet({ open: false, course: null }); void load(); }}
        />
      </BottomSheet>
    </div>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CourseForm({ course, onDone }: { course: Course | null; onDone: () => void }) {
  const [name, setName] = useState(course?.name ?? "");
  const [code, setCode] = useState(course?.code ?? "");
  const [instructor, setInstructor] = useState(course?.instructor ?? "");
  const [color, setColor] = useState(course?.color ?? "green");
  const [room, setRoom] = useState(course?.room ?? "");
  const [semester, setSemester] = useState(course?.semester ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [slots, setSlots] = useState<Array<{ dayOfWeek: number; startTime: string; endTime: string }>>(course?.schedule ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr("Give the course a name."); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || null,
        instructor: instructor.trim() || null,
        color,
        room: room.trim() || null,
        semester: semester.trim() || null,
        description: description.trim() || null,
        schedule: slots,
      };
      const res = course
        ? await fetch(`/api/courses/${course.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not save the course");
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save the course");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Course name" htmlFor="course-name">
        <input id="course-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputCls} placeholder="e.g. Physics" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code (optional)" htmlFor="course-code">
          <input id="course-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} className={inputCls} placeholder="PHY-101" />
        </Field>
        <Field label="Instructor (optional)" htmlFor="course-instructor">
          <input id="course-instructor" value={instructor} onChange={(e) => setInstructor(e.target.value)} maxLength={100} className={inputCls} placeholder="As listed by school" />
        </Field>
        <Field label="Room (optional)" htmlFor="course-room">
          <input id="course-room" value={room} onChange={(e) => setRoom(e.target.value)} maxLength={50} className={inputCls} />
        </Field>
        <Field label="Semester (optional)" htmlFor="course-semester">
          <input id="course-semester" value={semester} onChange={(e) => setSemester(e.target.value)} maxLength={50} className={inputCls} placeholder="e.g. Term 2" />
        </Field>
      </div>
      <Field label="Accent color" htmlFor="course-color">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Course accent color">
          {COURSE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              onClick={() => setColor(c)}
              className={cn(
                "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border",
                color === c ? "border-primary" : "border-border"
              )}
            >
              <CourseDot color={c} className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Description (optional)" htmlFor="course-desc">
        <Textarea id="course-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={2} />
      </Field>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" id="slot-label">Weekly slots (optional)</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => setSlots((s) => [...s, { dayOfWeek: 1, startTime: "09:00", endTime: "09:50" }].slice(0, 20))}
          >
            Add slot
          </Button>
        </div>
        {slots.map((s, i) => (
          <div key={i} className="flex items-center gap-2" role="group" aria-label={`Slot ${i + 1}`}>
            <select value={s.dayOfWeek} onChange={(e) => setSlots((all) => all.map((x, j) => (j === i ? { ...x, dayOfWeek: Number(e.target.value) } : x)))} aria-label="Day" className="min-h-[44px] rounded-xl border border-input bg-background px-2 text-sm">
              {DAYS.map((d, di) => <option key={d} value={di}>{d}</option>)}
            </select>
            <input type="time" value={s.startTime} onChange={(e) => setSlots((all) => all.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} aria-label="Start time" className={cn(inputCls, "px-2")} />
            <input type="time" value={s.endTime} onChange={(e) => setSlots((all) => all.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)))} aria-label="End time" className={cn(inputCls, "px-2")} />
            <button type="button" onClick={() => setSlots((all) => all.filter((_, j) => j !== i))} aria-label={`Remove slot ${i + 1}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button type="submit" disabled={saving} className="min-h-[48px] w-full rounded-xl">
        {saving ? "Saving…" : course ? "Save changes" : "Create course"}
      </Button>
    </form>
  );
}
