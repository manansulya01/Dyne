"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, ListTodo, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/Sheet";
import { apiErrorMessage, cn } from "@/lib/utils";
import {
  CourseDot, CourseSelect, Field, PriorityBadge, dueLabel, inputCls, isOverdue, useCourses,
} from "@/components/academic/bits";

import type { TaskJSON as Task } from "@/types";

type View = "today" | "upcoming" | "completed" | "all";

const VIEWS: Array<{ value: View; label: string }> = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
];

export function TasksClient() {
  const [view, setViewState] = useState<View>("today");
  // Changing the filter dismisses the "no due date" hint.
  const setView = (v: View) => {
    setViewState(v);
    setNotice(null);
  };
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [sheet, setSheet] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const [notice, setNotice] = useState<string | null>(null);
  const courses = useCourses();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view, limit: "100" });
      if (search.trim()) params.set("search", search.trim());
      if (priority) params.set("priority", priority);
      const res = await fetch(`/api/tasks?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load tasks");
      setTasks(data.tasks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [view, search, priority]);

  useEffect(() => {
    // Initial + refetch on view/search/filter change (fetch resolves async; safe here).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const toggle = async (t: Task) => {
    const done = !t.completed_at;
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed_at: done ? new Date().toISOString() : null } : x)));
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: done }),
      });
      if (!res.ok) throw new Error();
      void load();
    } catch {
      void load();
    }
  };

  const remove = async (t: Task) => {
    if (!confirm(`Delete "${t.title}"?`)) return;
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    const snapshot = tasks;
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Could not delete the task"));
    } catch (err) {
      // Roll back so a failed delete never leaves the row silently missing.
      setTasks(snapshot);
      setError(err instanceof Error ? err.message : "Could not delete the task");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="dyne-page-title">Tasks</h1>
          <p className="dyne-page-subtitle">What needs doing — nothing slips.</p>
        </div>
        <Button onClick={() => setSheet({ open: true, task: null })} className="min-h-[44px] rounded-xl">
          <Plus className="h-4 w-4" aria-hidden="true" /> New task
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5" role="tablist" aria-label="Task views">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              role="tab"
              aria-selected={view === v.value}
              onClick={() => setView(v.value)}
              className={cn(
                "min-h-[44px] rounded-xl px-3.5 text-sm font-semibold",
                view === v.value ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          maxLength={100}
          aria-label="Search tasks"
          className={cn(inputCls, "max-w-[180px]")}
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          aria-label="Filter by priority"
          className="min-h-[44px] rounded-xl border border-input bg-background px-2.5 text-sm"
        >
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div className="mt-4" role="tabpanel" aria-label={`${view} tasks`}>
        {notice && (
          <p role="status" className="mb-3 rounded-xl border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        {loading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <div className="dyne-card"><ErrorState title="Couldn't load tasks" description={error} onRetry={() => void load()} /></div>
        ) : tasks.length === 0 ? (
          <div className="dyne-card">
            <EmptyState
              icon={ListTodo}
              title={view === "completed" ? "Nothing completed yet" : view === "today" ? "No tasks due today" : "No tasks here"}
              description={view === "completed"
                ? "Completed tasks will appear here."
                : "Create your first task to get organized."}
              actionLabel={view !== "completed" ? "Create task" : undefined}
              onAction={view !== "completed" ? () => setSheet({ open: true, task: null }) : undefined}
            />
          </div>
        ) : (
          <ul className="dyne-card divide-y divide-border overflow-hidden">
            {tasks.map((t) => {
              const done = !!t.completed_at;
              const overdue = isOverdue(t.due_date, done);
              const due = dueLabel(t.due_date);
              return (
                <li key={t.id} className="flex items-start gap-2.5 px-3 py-2.5 sm:px-4">
                  <button
                    onClick={() => void toggle(t)}
                    aria-pressed={done}
                    aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-muted"
                  >
                    {done
                      ? <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
                      : <Circle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
                  </button>
                  <div className="min-w-0 flex-1 py-1.5">
                    <p className={cn("truncate text-[15px] font-medium", done && "text-muted-foreground line-through")}>
                      {t.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {t.course && (
                        <span className="inline-flex items-center gap-1">
                          <CourseDot color={t.course.color} /> {t.course.name}
                        </span>
                      )}
                      {due && <span className={overdue ? "font-semibold text-destructive" : undefined}>{due}</span>}
                      <PriorityBadge priority={t.priority} />
                      {t.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded bg-muted px-1.5 py-0.5">#{tag}</span>
                      ))}
                    </p>
                  </div>
                  <div className="flex shrink-0">
                    <button
                      onClick={() => setSheet({ open: true, task: t })}
                      aria-label={`Edit ${t.title}`}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => void remove(t)}
                      aria-label={`Delete ${t.title}`}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BottomSheet open={sheet.open} onClose={() => setSheet({ open: false, task: null })} title={sheet.task ? "Edit task" : "New task"}>
        <TaskForm
          key={sheet.task?.id ?? "new"}
          task={sheet.task}
          courses={courses}
          onDone={(created) => {
            setSheet({ open: false, task: null });
            // A task saved without a due date does not belong to the
            // Today/Upcoming filters. Switching to All (and saying so) keeps
            // the create from looking like it silently did nothing.
            if (created && !created.due_date && (view === "today" || view === "upcoming")) {
              setViewState("all");
              setNotice(`“${created.title}” has no due date — showing all tasks.`);
            }
            void load();
          }}
        />
      </BottomSheet>
    </div>
  );
}

function TaskForm({ task, courses, onDone }: {
  task: Task | null;
  courses: Array<{ id: string; name: string; color: string }>;
  onDone: (created?: Task | null) => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState(task?.priority ?? "medium");
  const [due, setDue] = useState(task?.due_date ? task.due_date.slice(0, 16) : "");
  const [courseId, setCourseId] = useState(task?.course_id ?? "");
  const [tags, setTags] = useState((task?.tags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setErr("Give the task a title."); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate: due ? new Date(due).toISOString() : null,
        courseId: courseId || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      const res = task
        ? await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not save the task");
      onDone(task ? null : (data?.task ?? null));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save the task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Title" htmlFor="task-title">
        <input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} placeholder="e.g. Revise chapter 4" />
      </Field>
      <Field label="Description (optional)" htmlFor="task-desc">
        <Textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={3} placeholder="Details, links, reminders…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority" htmlFor="task-priority">
          <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className={inputCls}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
        <Field label="Due date (optional)" htmlFor="task-due">
          <input id="task-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="Course (optional)" htmlFor="task-course">
        <CourseSelect id="task-course" value={courseId} onChange={setCourseId} courses={courses} />
      </Field>
      <Field label="Tags (optional, comma-separated)" htmlFor="task-tags">
        <input id="task-tags" value={tags} onChange={(e) => setTags(e.target.value)} maxLength={200} className={inputCls} placeholder="revision, physics" />
      </Field>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button type="submit" disabled={saving} className="min-h-[48px] w-full rounded-xl">
        {saving ? "Saving…" : task ? "Save changes" : "Create task"}
      </Button>
    </form>
  );
}
