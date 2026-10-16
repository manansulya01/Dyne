"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

/**
 * Teacher assignment list + creation.
 *
 * Completion counts come from the server (derived from real submissions) and
 * are shown as "No data" when there is no roster — never invented.
 */

interface AssignmentRow {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  class_grade: string;
  status: string;
  due_date: string | null;
  max_marks: number | null;
  assigned_count: number;
  completed_count: number;
  created_at: string;
}

const STATUSES = ["draft", "published", "closed"] as const;

export function AssignmentsManager({
  classes,
  canCreate,
}: {
  classes: string[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<AssignmentRow[]>([]);
  const [status, setStatus] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "40" });
      if (status) params.set("status", status);
      const res = await fetch(`/api/class-assignments?${params.toString()}`);
      const data = await res.json();
      if (res.ok) setItems(data.assignments ?? []);
      else setNotice(data.error ?? "Could not load assignments.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filter-scoped server-state sync; refresh shared with mutations
    void load();
  }, [load]);

  const publish = async (id: string) => {
    const res = await fetch(`/api/class-assignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });
    const data = await res.json();
    setNotice(
      res.ok
        ? `Published. ${data.notified ?? 0} student${data.notified === 1 ? "" : "s"} notified.`
        : "Could not publish the assignment."
    );
    await load();
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Class assignments</h1>
          <p className="text-sm text-muted-foreground">
            Create work for a class, publish it once, and monitor exactly who has completed it.
          </p>
        </div>
        {canCreate && (
          <Button className="min-h-[44px]" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New assignment
          </Button>
        )}
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
          {notice}
        </p>
      )}

      {showForm && canCreate && (
        <AssignmentForm
          classes={classes}
          onCreated={async (msg) => {
            setNotice(msg);
            setShowForm(false);
            await load();
            router.refresh();
          }}
          onError={(m) => setNotice(m)}
        />
      )}

      <div className="flex gap-1.5" role="group" aria-label="Status filter">
        {["", ...STATUSES].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={cn(
              "min-h-[44px] rounded-xl px-4 text-sm font-medium capitalize",
              status === s ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            )}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No assignments yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => {
            const pct =
              a.assigned_count > 0 ? Math.round((a.completed_count / a.assigned_count) * 100) : null;
            return (
              <li key={a.id}>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium capitalize">
                        {a.status}
                      </span>
                      <span className="rounded bg-muted px-2 py-0.5 text-[11px]">{a.class_grade}</span>
                      <span className="text-xs text-muted-foreground">{a.subject}</span>
                    </div>
                    <Link href={`/teacher/assignments/${a.id}`} className="mt-1.5 block min-h-[44px]">
                      <h2 className="font-semibold">{a.title}</h2>
                    </Link>
                    {a.due_date && (
                      <p className="text-xs text-muted-foreground">Due {new Date(a.due_date).toLocaleString()}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div
                        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={pct ?? 0}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${a.title} completion`}
                      >
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct ?? 0}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {a.assigned_count > 0
                          ? `${a.completed_count}/${a.assigned_count} completed`
                          : "No roster data"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline" className="min-h-[44px]">
                        <Link href={`/teacher/assignments/${a.id}`}>Monitor completion</Link>
                      </Button>
                      {a.status === "draft" && (
                        <Button size="sm" className="min-h-[44px]" onClick={() => publish(a.id)}>
                          Publish &amp; notify
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AssignmentForm({
  classes,
  onCreated,
  onError,
}: {
  classes: string[];
  onCreated: (message: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [classGrade, setClassGrade] = useState(classes[0] ?? "");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxMarks, setMaxMarks] = useState("");
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/class-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          subject: subject.trim(),
          classGrade,
          instructions: instructions.trim() || undefined,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          maxMarks: maxMarks ? Number(maxMarks) : null,
          status: publish ? "published" : "draft",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const first =
          typeof data.error === "string"
            ? data.error
            : data.error
              ? Object.values(data.error).flat().find((v: unknown) => typeof v === "string")
              : null;
        throw new Error(first || "Could not create the assignment");
      }
      setTitle("");
      setDescription("");
      setInstructions("");
      setDueDate("");
      setMaxMarks("");
      await onCreated(
        publish
          ? `Assignment published. ${data.notified ?? 0} student${data.notified === 1 ? "" : "s"} notified.`
          : "Assignment saved as a draft."
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create the assignment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <form onSubmit={submit} className="space-y-3">
          <h2 className="font-semibold">New class assignment</h2>
          <div>
            <label htmlFor="ta-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="ta-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              className="mt-1 min-h-[44px]"
            />
          </div>
          <div>
            <label htmlFor="ta-desc" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="ta-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={3}
              className="mt-1"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="ta-subject" className="text-sm font-medium">
                Subject
              </label>
              <Input
                id="ta-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={100}
                required
                className="mt-1 min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="ta-class" className="text-sm font-medium">
                Class
              </label>
              {classes.length > 0 ? (
                <select
                  id="ta-class"
                  value={classGrade}
                  onChange={(e) => setClassGrade(e.target.value)}
                  required
                  className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {classes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="ta-class"
                  value={classGrade}
                  onChange={(e) => setClassGrade(e.target.value)}
                  maxLength={50}
                  required
                  placeholder="e.g. Grade 9"
                  className="mt-1 min-h-[44px]"
                />
              )}
            </div>
            <div>
              <label htmlFor="ta-marks" className="text-sm font-medium">
                Max marks (optional)
              </label>
              <Input
                id="ta-marks"
                type="number"
                min={1}
                value={maxMarks}
                onChange={(e) => setMaxMarks(e.target.value)}
                className="mt-1 min-h-[44px]"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ta-instructions" className="text-sm font-medium">
              Submission instructions
            </label>
            <Textarea
              id="ta-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={5000}
              rows={3}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="ta-due" className="text-sm font-medium">
              Due date (optional)
            </label>
            <input
              id="ta-due"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 block min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
            />
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Publish now and notify the class
          </label>
          <Button type="submit" disabled={busy} className="min-h-[48px] w-full sm:w-auto">
            {busy ? "Saving…" : publish ? "Publish assignment" : "Save draft"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
