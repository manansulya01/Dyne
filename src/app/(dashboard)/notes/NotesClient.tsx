"use client";

import { useCallback, useEffect, useState } from "react";
import { NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/Sheet";
import { apiErrorMessage, formatRelativeTime } from "@/lib/utils";
import { CourseDot, CourseSelect, Field, inputCls, useCourses } from "@/components/academic/bits";
import { cn } from "@/lib/utils";

import type { NoteJSON as Note } from "@/types";

export function NotesClient() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [selected, setSelected] = useState<Note | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; note: Note | null }>({ open: false, note: null });
  const courses = useCourses();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (search.trim()) params.set("search", search.trim());
      if (courseFilter) params.set("courseId", courseFilter);
      const res = await fetch(`/api/notes?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load notes");
      const list: Note[] = data.notes ?? [];
      setNotes(list);
      setSelected((prev) => (prev ? (list.find((n) => n.id === prev.id) ?? null) : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [search, courseFilter]);

  useEffect(() => {
    // Initial + refetch on search/filter change (fetch resolves async; safe here).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const remove = async (n: Note) => {
    if (!confirm(`Delete "${n.title}"?`)) return;
    const snapshot = notes;
    const wasSelected = selected?.id === n.id;
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
    if (wasSelected) setSelected(null);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${n.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Could not delete the note"));
    } catch (e) {
      setNotes(snapshot);
      if (wasSelected) setSelected(snapshot.find((x) => x.id === n.id) ?? null);
      setError(e instanceof Error ? e.message : "Could not delete the note");
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-6 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="dyne-page-title">Notes</h1>
          <p className="dyne-page-subtitle">Private by default — only you can read these.</p>
        </div>
        <Button onClick={() => setSheet({ open: true, note: null })} className="min-h-[44px] rounded-xl">
          <Plus className="h-4 w-4" aria-hidden="true" /> New note
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your notes…"
          maxLength={100}
          aria-label="Search notes"
          className={cn(inputCls, "max-w-xs flex-1")}
        />
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          aria-label="Filter by course"
          className="min-h-[44px] rounded-xl border border-input bg-background px-2.5 text-sm"
        >
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {loading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <div className="dyne-card"><ErrorState title="Couldn't load notes" description={error} onRetry={() => void load()} /></div>
        ) : notes.length === 0 ? (
          <div className="dyne-card">
            <EmptyState
              icon={NotebookPen}
              title="No notes yet"
              description="Capture class notes, summaries, and ideas. They stay private to you."
              actionLabel="Create note"
              onAction={() => setSheet({ open: true, note: null })}
            />
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
            <ul className="dyne-card max-h-[60svh] divide-y divide-border overflow-y-auto lg:max-h-none" aria-label="Note list">
              {notes.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => setSelected(n)}
                    aria-current={selected?.id === n.id ? "true" : undefined}
                    className={cn(
                      "block w-full px-3.5 py-3 text-left transition-colors hover:bg-muted",
                      selected?.id === n.id && "bg-primary/5"
                    )}
                  >
                    <span className="block truncate text-sm font-semibold">{n.title}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {n.course && (
                        <span className="inline-flex items-center gap-1">
                          <CourseDot color={n.course.color} /> {n.course.name}
                        </span>
                      )}
                      <time>{formatRelativeTime(n.updated_at)}</time>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <article className="dyne-card min-h-[300px] p-4 sm:p-5" aria-label="Note reading pane" aria-live="polite">
              {selected ? (
                <>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-bold tracking-tight">{selected.title}</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Updated {formatRelativeTime(selected.updated_at)}
                        {selected.tags.length > 0 && ` · ${selected.tags.map((t) => `#${t}`).join(" ")}`}
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      <button onClick={() => setSheet({ open: true, note: selected })} aria-label={`Edit ${selected.title}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button onClick={() => void remove(selected)} aria-label={`Delete ${selected.title}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-destructive">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                    {selected.body || <span className="text-muted-foreground">Empty note.</span>}
                  </p>
                </>
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">Select a note to read it here.</p>
              )}
            </article>
          </div>
        )}
      </div>

      <BottomSheet open={sheet.open} onClose={() => setSheet({ open: false, note: null })} title={sheet.note ? "Edit note" : "New note"}>
        <NoteForm
          key={sheet.note?.id ?? "new"}
          note={sheet.note}
          courses={courses}
          onDone={(saved) => {
            setSheet({ open: false, note: null });
            if (saved) setSelected(saved);
            void load();
          }}
        />
      </BottomSheet>
    </div>
  );
}

function NoteForm({ note, courses, onDone }: {
  note: Note | null;
  courses: Array<{ id: string; name: string; color: string }>;
  onDone: (saved: Note | null) => void;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [courseId, setCourseId] = useState(note?.course_id ?? "");
  const [tags, setTags] = useState((note?.tags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setErr("Give the note a title."); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        title: title.trim(),
        body,
        courseId: courseId || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      const res = note
        ? await fetch(`/api/notes/${note.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not save the note");
      onDone((data?.note ?? null) as Note | null);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save the note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Title" htmlFor="note-title">
        <input id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} placeholder="e.g. Photosynthesis summary" />
      </Field>
      <Field label="Body" htmlFor="note-body">
        <Textarea id="note-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={50000} rows={8} placeholder="Write freely…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Course (optional)" htmlFor="note-course">
          <CourseSelect id="note-course" value={courseId} onChange={setCourseId} courses={courses} />
        </Field>
        <Field label="Tags (optional)" htmlFor="note-tags">
          <input id="note-tags" value={tags} onChange={(e) => setTags(e.target.value)} maxLength={200} className={inputCls} placeholder="bio, ch-4" />
        </Field>
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button type="submit" disabled={saving} className="min-h-[48px] w-full rounded-xl">
        {saving ? "Saving…" : note ? "Save changes" : "Create note"}
      </Button>
    </form>
  );
}
