"use client";

import { useEffect, useState } from "react";

/**
 * A stable "now" for render-time date comparisons.
 *
 * `new Date()` / `Date.now()` are impure and are not called during render; the
 * clock is sampled in an effect (and on an interval) instead. The initial value
 * is `null` so the first client render matches the server exactly.
 */
export function useNow(intervalMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const sample = () => setNow(new Date());
    sample();
    const id = window.setInterval(sample, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}

/** True when `iso` is a parseable date strictly in the past. */
export function useIsOverdue(iso: string | null | undefined): boolean {
  const now = useNow();
  if (!iso || !now) return false;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  return t < now.getTime();
}
