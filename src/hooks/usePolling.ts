"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Deployment-compatible live-update primitive.
 *
 * Polls `fetcher` on an interval while the tab is visible, with cleanup on
 * unmount. This is honest polling (real data every tick) — not fake
 * realtime — and the call sites are structured so a push provider can later
 * replace the tick without touching component logic.
 */
export const POLL_INTERVALS = {
  /** Chat threads: frequent enough to feel live, cheap single queries. */
  chat: 5000,
  /** Notification bell/list. */
  notifications: 15000,
  /** Conversation list previews. */
  conversations: 10000,
} as const;
export function usePolling(
  fetcher: () => void | Promise<void>,
  intervalMs: number,
  enabled = true
) {
  const saved = useRef(fetcher);
  useEffect(() => {
    saved.current = fetcher;
  }, [fetcher]);

  const tick = useCallback(() => {
    try {
      const result = saved.current();
      if (result instanceof Promise) {
        result.catch(() => {
          /* transient network failures resolve on the next tick */
        });
      }
    } catch {
      /* transient failures resolve on the next tick */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    tick();
    if (typeof document !== "undefined" && document.hidden) {
      // Start paused when the tab is hidden; resume on visibility change.
    }
    const id = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) tick();
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document?.addEventListener?.("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document?.removeEventListener?.("visibilitychange", onVisible);
    };
  }, [tick, intervalMs, enabled]);
}
