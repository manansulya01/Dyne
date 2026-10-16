"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Flame, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/Sheet";
import { apiErrorMessage, cn } from "@/lib/utils";
import { Field, inputCls } from "@/components/academic/bits";

import type { HabitJSON as Habit } from "@/types";

export function HabitsClient() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [sheet, setSheet] = useState<{ open: boolean; habit: Habit | null }>({ open: false, habit: null });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/habits?limit=100");
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load habits");
      setHabits(data.habits ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load habits");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial habits load only (fetch resolves async; safe here).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const setToday = async (h: Habit, count: number) => {
    setHabits((prev) => prev.map((x) => (x.id === h.id ? { ...x, today_count: count } : x)));
    try {
      const res = await fetch(`/api/habits/${h.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log: { date: todayKey(), count } }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.habit) {
        setHabits((prev) => prev.map((x) => (x.id === h.id ? { ...x, ...(data.habit as Habit) } : x)));
      }
    } catch {
      void load();
    }
  };

  const toggleActive = async (h: Habit) => {
    setHabits((prev) => prev.map((x) => (x.id === h.id ? { ...x, is_active: !x.is_active } : x)));
    await fetch(`/api/habits/${h.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !h.is_active }),
    }).catch(() => {});
  };

  const remove = async (h: Habit) => {
    if (!confirm(`Delete "${h.name}" and its history?`)) return;
    const snapshot = habits;
    setHabits((prev) => prev.filter((x) => x.id !== h.id));
    setError(null);
    try {
      const res = await fetch(`/api/habits/${h.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Could not delete the habit"));
    } catch (e) {
      setHabits(snapshot);
      setError(e instanceof Error ? e.message : "Could not delete the habit");
    }
  };

  const visible = showInactive ? habits : habits.filter((h) => h.is_active);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="dyne-page-title">Habits</h1>
          <p className="dyne-page-subtitle">Small reps, every day. Streaks earn themselves.</p>
        </div>
        <Button onClick={() => setSheet({ open: true, habit: null })} className="min-h-[44px] rounded-xl">
          <Plus className="h-4 w-4" aria-hidden="true" /> New habit
        </Button>
      </div>

      <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm font-medium">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="h-5 w-5 accent-[var(--accent)]"
        />
        Show paused habits
      </label>

      <div className="mt-2">
        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <div className="dyne-card"><ErrorState title="Couldn't load habits" description={error} onRetry={() => void load()} /></div>
        ) : visible.length === 0 ? (
          <div className="dyne-card">
            <EmptyState
              icon={Flame}
              title="No habits yet"
              description="Create your own — reading, revision, exercise. Check in daily to build a streak."
              actionLabel="Create habit"
              onAction={() => setSheet({ open: true, habit: null })}
            />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {visible.map((h) => {
              const met = h.today_count >= h.target;
              return (
                <li key={h.id} className={cn("dyne-card p-3.5 sm:p-4", !h.is_active && "opacity-60")}>
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => void setToday(h, met ? 0 : h.target)}
                      aria-pressed={met}
                      aria-label={met ? `Uncheck ${h.name} for today` : `Check in ${h.name} for today`}
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
                        met ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Check className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold">{h.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="capitalize">{h.frequency} · target {h.target}</span>
                        {h.streak > 0 && (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                            <Flame className="h-3.5 w-3.5" aria-hidden="true" /> {h.streak}
                          </span>
                        )}
                        {!h.is_active && <span>· paused</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      <button onClick={() => setSheet({ open: true, habit: h })} aria-label={`Edit ${h.name}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button onClick={() => void remove(h)} aria-label={`Delete ${h.name}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-destructive">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => void toggleActive(h)}>
                      {h.is_active ? "Pause" : "Resume"}
                    </Button>
                    {h.today_count > h.target && (
                      <span className="inline-flex min-h-[44px] items-center text-xs font-semibold text-muted-foreground" aria-live="polite">
                        {h.today_count}× today — over target
                      </span>
                    )}
                    {h.today_count > 0 && h.today_count < h.target && (
                      <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => void setToday(h, h.today_count + 1)}>
                        +1 ({h.today_count}/{h.target})
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BottomSheet open={sheet.open} onClose={() => setSheet({ open: false, habit: null })} title={sheet.habit ? "Edit habit" : "New habit"}>
        <HabitForm
          key={sheet.habit?.id ?? "new"}
          habit={sheet.habit}
          onDone={() => { setSheet({ open: false, habit: null }); void load(); }}
        />
      </BottomSheet>
    </div>
  );
}

function HabitForm({ habit, onDone }: { habit: Habit | null; onDone: () => void }) {
  const [name, setName] = useState(habit?.name ?? "");
  const [frequency, setFrequency] = useState(habit?.frequency ?? "daily");
  const [target, setTarget] = useState(String(habit?.target ?? 1));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr("Give the habit a name."); return; }
    const t = Number(target);
    if (!Number.isInteger(t) || t < 1 || t > 100) { setErr("Target must be 1–100."); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = { name: name.trim(), frequency, target: t };
      const res = habit
        ? await fetch(`/api/habits/${habit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/habits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not save the habit");
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save the habit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Habit name" htmlFor="habit-name">
        <input id="habit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputCls} placeholder="e.g. Morning revision" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Frequency" htmlFor="habit-freq">
          <select id="habit-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)} className={inputCls}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </Field>
        <Field label={frequency === "daily" ? "Times per day" : "Times per week"} htmlFor="habit-target">
          <input id="habit-target" type="number" min={1} max={100} value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} />
        </Field>
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button type="submit" disabled={saving} className="min-h-[48px] w-full rounded-xl">
        {saving ? "Saving…" : habit ? "Save changes" : "Create habit"}
      </Button>
    </form>
  );
}
