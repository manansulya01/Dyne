"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/Sheet";
import { apiErrorMessage, cn } from "@/lib/utils";
import {
  CourseDot, CourseSelect, Field, PriorityBadge, ProgressBar, dueLabel, inputCls, isOverdue, useCourses,
} from "@/components/academic/bits";

import type { AssignmentJSON as Assignment } from "@/types";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  completed: "Completed",
};

const FILTERS = ["open", "not_started", "in_progress", "submitted", "completed"] as const;

export function AssignmentsClient() {
  const [filter, setFilter] = useState<string>("open");
  const [items, setItems] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; item: Assignment | null }>({ open: false, item: null });
  const courses = useCourses();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/assignments?status=${filter}&limit=100`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load assignments");
      setItems(data.assignments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load assignments");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    // Initial + refetch on filter change (fetch resolves async; safe here).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const remove = async (a: Assignment) => {
    if (!confirm(`Delete "${a.title}"?`)) return;
    setItems((prev) => prev.filter((x) => x.id !== a.id));
    const snapshot = items;
    setError(null);
    try {
      const res = await fetch(`/api/assignments/${a.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Could not delete the assignment"));
    } catch (err) {
      // Roll back so a failed delete never leaves the row silently missing.
      setItems(snapshot);
      setError(err instanceof Error ? err.message : "Could not delete the assignment");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="dyne-page-title">Assignments</h1>
          <p className="dyne-page-subtitle">Track every hand-in, start to submit.</p>
        </div>
        <Button onClick={() => setSheet({ open: true, item: null })} className="min-h-[44px] rounded-xl">
          <Plus className="h-4 w-4" aria-hidden="true" /> New assignment
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Assignment status filter">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "min-h-[44px] rounded-xl px-3.5 text-sm font-semibold capitalize",
              filter === f ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            )}
          >
            {f === "open" ? "Open" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <div className="dyne-card"><ErrorState title="Couldn't load assignments" description={error} onRetry={() => void load()} /></div>
        ) : items.length === 0 ? (
          <div className="dyne-card">
            <EmptyState
              icon={ClipboardList}
              title="No assignments here"
              description="Add coursework with a due date and track it to submission."
              actionLabel="Create assignment"
              onAction={() => setSheet({ open: true, item: null })}
            />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {items.map((a) => {
              const done = a.status === "completed";
              const overdue = isOverdue(a.due_date, done);
              return (
                <li key={a.id} className="dyne-card p-3.5 sm:p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{a.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {a.course && (
                          <span className="inline-flex items-center gap-1">
                            <CourseDot color={a.course.color} /> {a.course.name}
                          </span>
                        )}
                        {dueLabel(a.due_date) && (
                          <span className={overdue ? "font-semibold text-destructive" : undefined}>{dueLabel(a.due_date)}</span>
                        )}
                        <PriorityBadge priority={a.priority} />
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{STATUS_LABEL[a.status] ?? a.status}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      <button onClick={() => setSheet({ open: true, item: a })} aria-label={`Edit ${a.title}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button onClick={() => void remove(a)} aria-label={`Delete ${a.title}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-destructive">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="flex-1"><ProgressBar value={a.progress} label={`${a.title} progress`} /></div>
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">{a.progress}%</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BottomSheet open={sheet.open} onClose={() => setSheet({ open: false, item: null })} title={sheet.item ? "Edit assignment" : "New assignment"}>
        <AssignmentForm
          key={sheet.item?.id ?? "new"}
          item={sheet.item}
          courses={courses}
          onDone={() => { setSheet({ open: false, item: null }); void load(); }}
        />
      </BottomSheet>
    </div>
  );
}

function AssignmentForm({ item, courses, onDone }: {
  item: Assignment | null;
  courses: Array<{ id: string; name: string; color: string }>;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [courseId, setCourseId] = useState(item?.course_id ?? "");
  const [due, setDue] = useState(item?.due_date ? item.due_date.slice(0, 16) : "");
  const [priority, setPriority] = useState(item?.priority ?? "medium");
  const [status, setStatus] = useState(item?.status ?? "not_started");
  const [progress, setProgress] = useState(item?.progress ?? 0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setErr("Give the assignment a title."); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        courseId: courseId || null,
        dueDate: due ? new Date(due).toISOString() : null,
        priority,
        status,
        progress,
      };
      const res = item
        ? await fetch(`/api/assignments/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not save the assignment");
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save the assignment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Title" htmlFor="asg-title">
        <input id="asg-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} placeholder="e.g. Lab report 3" />
      </Field>
      <Field label="Description (optional)" htmlFor="asg-desc">
        <Textarea id="asg-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={3} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Course (optional)" htmlFor="asg-course">
          <CourseSelect id="asg-course" value={courseId} onChange={setCourseId} courses={courses} />
        </Field>
        <Field label="Due date (optional)" htmlFor="asg-due">
          <input id="asg-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Priority" htmlFor="asg-priority">
          <select id="asg-priority" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className={inputCls}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
        <Field label="Status" htmlFor="asg-status">
          <select id="asg-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputCls}>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="submitted">Submitted</option>
            <option value="completed">Completed</option>
          </select>
        </Field>
      </div>
      <Field label={`Progress — ${progress}%`} htmlFor="asg-progress">
        <input id="asg-progress" type="range" min={0} max={100} value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
      </Field>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button type="submit" disabled={saving} className="min-h-[48px] w-full rounded-xl">
        {saving ? "Saving…" : item ? "Save changes" : "Create assignment"}
      </Button>
    </form>
  );
}
