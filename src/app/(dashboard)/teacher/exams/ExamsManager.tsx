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
 * Exam list + creation for teachers/admins.
 *
 * The question builder itself lives on the exam detail page; this screen owns
 * the exam shell (title, class, window, marks, mode, publish state).
 */

interface ExamRow {
  id: string;
  title: string;
  subject: string;
  class_grade: string;
  mode: string;
  status: string;
  total_marks: number;
  question_count: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

const MODES = ["practice", "timed", "question_paper", "assessment"] as const;

export function ExamsManager({
  classes,
  canCreate,
}: {
  classes: string[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ExamRow[]>([]);
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "40" });
      if (status) params.set("status", status);
      const res = await fetch(`/api/class-exams?${params.toString()}`);
      const data = await res.json();
      if (res.ok) setItems(data.exams ?? []);
      else setNotice(data.error ?? "Could not load exams.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filter-scoped server-state sync; refresh shared with mutations
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Exams</h1>
          <p className="text-sm text-muted-foreground">
            Build exams with mixed question types, publish them, and grade the written responses.
          </p>
        </div>
        {canCreate && (
          <Button className="min-h-[44px]" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New exam
          </Button>
        )}
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
          {notice}
        </p>
      )}

      {showForm && canCreate && (
        <ExamForm
          classes={classes}
          onCreated={(msg) => {
            setNotice(msg);
            setShowForm(false);
            void load();
            router.refresh();
          }}
          onError={(m) => setNotice(m)}
        />
      )}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status filter">
        {["", "draft", "published", "closed"].map((s) => (
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
        <p className="py-8 text-center text-sm text-muted-foreground">No exams yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((e) => (
            <li key={e.id}>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium capitalize">
                      {e.status}
                    </span>
                    <span className="rounded bg-muted px-2 py-0.5 text-[11px]">{e.class_grade}</span>
                    <span className="rounded bg-muted px-2 py-0.5 text-[11px] capitalize">{e.mode}</span>
                  </div>
                  <Link href={`/teacher/exams/${e.id}`} className="mt-1.5 block min-h-[44px]">
                    <h2 className="font-semibold">{e.title}</h2>
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {e.subject} · {e.question_count} question{e.question_count === 1 ? "" : "s"} ·{" "}
                    {e.total_marks} marks
                    {e.starts_at ? ` · opens ${new Date(e.starts_at).toLocaleString()}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline" className="min-h-[44px]">
                      <Link href={`/teacher/exams/${e.id}`}>Open builder &amp; results</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ExamForm({
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
  const [mode, setMode] = useState<string>("timed");
  const [duration, setDuration] = useState("60");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [totalMarks, setTotalMarks] = useState("20");
  const [passingMarks, setPassingMarks] = useState("8");
  const [attemptLimit, setAttemptLimit] = useState("1");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/class-exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          subject: subject.trim(),
          classGrade,
          mode,
          instructions: instructions.trim() || undefined,
          durationMinutes: duration ? Number(duration) : null,
          startsAt: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          totalMarks: Number(totalMarks),
          passingMarks: Number(passingMarks),
          attemptLimit: Number(attemptLimit),
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
        throw new Error(first || "Could not create the exam");
      }
      setTitle("");
      setDescription("");
      setInstructions("");
      await onCreated("Exam created as a draft. Add questions, then publish.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create the exam");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <form onSubmit={submit} className="space-y-3">
          <h2 className="font-semibold">New exam</h2>
          <div>
            <label htmlFor="ex-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="ex-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              className="mt-1 min-h-[44px]"
            />
          </div>
          <div>
            <label htmlFor="ex-desc" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="ex-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={2}
              className="mt-1"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="ex-subject" className="text-sm font-medium">
                Subject
              </label>
              <Input
                id="ex-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={100}
                required
                className="mt-1 min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="ex-class" className="text-sm font-medium">
                Class
              </label>
              {classes.length > 0 ? (
                <select
                  id="ex-class"
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
                  id="ex-class"
                  value={classGrade}
                  onChange={(e) => setClassGrade(e.target.value)}
                  maxLength={50}
                  required
                  className="mt-1 min-h-[44px]"
                />
              )}
            </div>
            <div>
              <label htmlFor="ex-mode" className="text-sm font-medium">
                Mode
              </label>
              <select
                id="ex-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor="ex-duration" className="text-sm font-medium">
                Duration (min)
              </label>
              <Input
                id="ex-duration"
                type="number"
                min={1}
                max={600}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="mt-1 min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="ex-total" className="text-sm font-medium">
                Total marks
              </label>
              <Input
                id="ex-total"
                type="number"
                min={1}
                value={totalMarks}
                onChange={(e) => setTotalMarks(e.target.value)}
                required
                className="mt-1 min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="ex-pass" className="text-sm font-medium">
                Passing marks
              </label>
              <Input
                id="ex-pass"
                type="number"
                min={0}
                value={passingMarks}
                onChange={(e) => setPassingMarks(e.target.value)}
                required
                className="mt-1 min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="ex-attempts" className="text-sm font-medium">
                Attempt limit
              </label>
              <Input
                id="ex-attempts"
                type="number"
                min={1}
                max={10}
                value={attemptLimit}
                onChange={(e) => setAttemptLimit(e.target.value)}
                required
                className="mt-1 min-h-[44px]"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ex-starts" className="text-sm font-medium">
                Opens
              </label>
              <input
                id="ex-starts"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="mt-1 block min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="ex-ends" className="text-sm font-medium">
                Closes (optional)
              </label>
              <input
                id="ex-ends"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="mt-1 block min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ex-instructions" className="text-sm font-medium">
              Instructions
            </label>
            <Textarea
              id="ex-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={5000}
              rows={3}
              className="mt-1"
            />
          </div>
          <Button type="submit" disabled={busy} className="min-h-[48px] w-full sm:w-auto">
            {busy ? "Creating…" : "Create exam draft"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Total marks are recalculated from the questions you add, so the two can never disagree.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
