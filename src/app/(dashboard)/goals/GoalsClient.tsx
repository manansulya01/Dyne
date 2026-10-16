"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/Sheet";
import { apiErrorMessage, cn } from "@/lib/utils";
import { Field, ProgressBar, inputCls } from "@/components/academic/bits";

import type { GoalJSON as Goal } from "@/types";

export function GoalsClient() {
  const [filter, setFilter] = useState("open");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; goal: Goal | null }>({ open: false, goal: null });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/goals?status=${filter}&limit=100`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load goals");
      setGoals(data.goals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load goals");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    // Initial + refetch on filter change (fetch resolves async; safe here).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const bump = async (g: Goal, delta: number) => {
    const next = Math.max(0, g.current + delta);
    setGoals((prev) => prev.map((x) => (x.id === g.id ? { ...x, current: next } : x)));
    await fetch(`/api/goals/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: next }),
    }).catch(() => {});
  };

  const toggleDone = async (g: Goal) => {
    const status = g.status === "completed" ? "active" : "completed";
    setGoals((prev) => prev.map((x) => (x.id === g.id ? { ...x, status } : x)));
    await fetch(`/api/goals/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
    void load();
  };

  const remove = async (g: Goal) => {
    if (!confirm(`Delete "${g.title}"?`)) return;
    const snapshot = goals;
    setGoals((prev) => prev.filter((x) => x.id !== g.id));
    setError(null);
    try {
      const res = await fetch(`/api/goals/${g.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Could not delete the goal"));
    } catch (e) {
      setGoals(snapshot);
      setError(e instanceof Error ? e.message : "Could not delete the goal");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="dyne-page-title">Goals</h1>
          <p className="dyne-page-subtitle">Aim at something — track the climb.</p>
        </div>
        <Button onClick={() => setSheet({ open: true, goal: null })} className="min-h-[44px] rounded-xl">
          <Plus className="h-4 w-4" aria-hidden="true" /> New goal
        </Button>
      </div>

      <div className="mt-4 flex gap-1.5" role="tablist" aria-label="Goal filter">
        {[["open", "Active"], ["completed", "Completed"], ["archived", "Archived"]].map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={filter === v}
            onClick={() => setFilter(v)}
            className={cn(
              "min-h-[44px] rounded-xl px-3.5 text-sm font-semibold",
              filter === v ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <div className="dyne-card"><ErrorState title="Couldn't load goals" description={error} onRetry={() => void load()} /></div>
        ) : goals.length === 0 ? (
          <div className="dyne-card">
            <EmptyState
              icon={Target}
              title="No goals here"
              description="Set a target with a deadline — progress updates as you log work."
              actionLabel="Create goal"
              onAction={() => setSheet({ open: true, goal: null })}
            />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {goals.map((g) => {
              const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
              return (
                <li key={g.id} className="dyne-card p-3.5 sm:p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold">{g.title}</p>
                      {g.description && <p className="dyne-line-2 mt-0.5 text-sm text-muted-foreground">{g.description}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-bold text-foreground tabular-nums">{g.current}</span>
                        {` / ${g.target} ${g.unit}`}
                        {g.deadline && ` · due ${new Date(g.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      <button onClick={() => setSheet({ open: true, goal: g })} aria-label={`Edit ${g.title}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button onClick={() => void remove(g)} aria-label={`Delete ${g.title}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-destructive">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2.5"><ProgressBar value={pct} label={`${g.title} progress`} /></div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => void bump(g, -1)} aria-label={`Decrease progress on ${g.title}`}>−1</Button>
                    <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => void bump(g, 1)} aria-label={`Log progress on ${g.title}`}>+1</Button>
                    <Button variant={g.status === "completed" ? "outline" : "default"} size="sm" className="min-h-[44px]" onClick={() => void toggleDone(g)}>
                      {g.status === "completed" ? "Reopen" : "Mark complete"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BottomSheet open={sheet.open} onClose={() => setSheet({ open: false, goal: null })} title={sheet.goal ? "Edit goal" : "New goal"}>
        <GoalForm
          key={sheet.goal?.id ?? "new"}
          goal={sheet.goal}
          onDone={() => { setSheet({ open: false, goal: null }); void load(); }}
        />
      </BottomSheet>
    </div>
  );
}

function GoalForm({ goal, onDone }: { goal: Goal | null; onDone: () => void }) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [target, setTarget] = useState(String(goal?.target ?? 10));
  const [current, setCurrent] = useState(String(goal?.current ?? 0));
  const [unit, setUnit] = useState(goal?.unit ?? "hours");
  const [deadline, setDeadline] = useState(goal?.deadline ? goal.deadline.slice(0, 16) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setErr("Give the goal a title."); return; }
    const t = Number(target);
    const c = Number(current);
    if (!(t > 0)) { setErr("Target must be a positive number."); return; }
    if (!(c >= 0)) { setErr("Current progress can't be negative."); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        target: t,
        current: c,
        unit: unit.trim() || "units",
        deadline: deadline ? new Date(deadline).toISOString() : null,
      };
      const res = goal
        ? await fetch(`/api/goals/${goal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not save the goal");
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save the goal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Title" htmlFor="goal-title">
        <input id="goal-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} placeholder="e.g. Study 20 hours this week" />
      </Field>
      <Field label="Description (optional)" htmlFor="goal-desc">
        <Textarea id="goal-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={2} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Target" htmlFor="goal-target">
          <input id="goal-target" type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Current" htmlFor="goal-current">
          <input id="goal-current" type="number" min={0} value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Unit" htmlFor="goal-unit">
          <input id="goal-unit" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} className={inputCls} placeholder="hours" />
        </Field>
      </div>
      <Field label="Deadline (optional)" htmlFor="goal-deadline">
        <input id="goal-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
      </Field>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button type="submit" disabled={saving} className="min-h-[48px] w-full rounded-xl">
        {saving ? "Saving…" : goal ? "Save changes" : "Create goal"}
      </Button>
    </form>
  );
}
