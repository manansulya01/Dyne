"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const COURSE_COLORS = ["green", "blue", "teal", "amber", "red", "purple", "slate", "rose"] as const;

const DOT: Record<string, string> = {
  green: "bg-emerald-600",
  blue: "bg-blue-600",
  teal: "bg-teal-600",
  amber: "bg-amber-600",
  red: "bg-red-500",
  purple: "bg-violet-600",
  slate: "bg-slate-500",
  rose: "bg-rose-500",
};

export function courseDot(color: string): string {
  return DOT[color] ?? DOT.slate;
}

export function CourseDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", courseDot(color), className)}
    />
  );
}

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  urgent: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[24px] items-center rounded-full px-2 text-[11px] font-semibold capitalize",
        PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.medium
      )}
    >
      {priority}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const v = Math.min(Math.max(Math.round(value), 0), 100);
  return (
    <div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export interface CourseOption { id: string; name: string; color: string }

export function useCourses() {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/courses?limit=100");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setCourses(((data.courses ?? []) as Array<Record<string, unknown>>).map((c) => ({
            id: String(c.id),
            name: String(c.name),
            color: String(c.color ?? "green"),
          })));
        }
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return courses;
}

export function CourseSelect({
  id,
  value,
  onChange,
  courses,
  allowNone = true,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  courses: CourseOption[];
  allowNone?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm"
    >
      {allowNone && <option value="">No course</option>}
      {courses.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

export const inputCls = "min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm";

/** "in 3d", "tomorrow", "today", "2d overdue" from an ISO date. */
export function dueLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(+d)) return null;
  const now = new Date();
  const startOf = (x: Date) => { const c = new Date(x); c.setHours(0, 0, 0, 0); return c; };
  const days = Math.round((startOf(d).getTime() - startOf(now).getTime()) / 86400000);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days > 1 && days < 7) return `Due in ${days}d`;
  if (days >= 7) return `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  if (days === -1) return "Due yesterday";
  return `${Math.abs(days)}d overdue`;
}

export function isOverdue(iso: string | null, done: boolean): boolean {
  if (!iso || done) return false;
  const d = new Date(iso);
  if (isNaN(+d)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/** Countdown parts to a future ISO datetime. */
export function countdown(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime() - Date.now();
  if (isNaN(t) || t <= 0) return null;
  const d = Math.floor(t / 86400000);
  const h = Math.floor((t % 86400000) / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export function formatMinutes(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
