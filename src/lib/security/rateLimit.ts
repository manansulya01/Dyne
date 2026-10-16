/**
 * Tiny in-memory sliding-window rate limiter for API routes.
 * Per-process (fine for single-instance dev; use Redis/DB in multi-instance prod).
 * Fail-closed on abuse: returns 429 shape helpers.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

function prune(b: Bucket, now: number, windowMs: number): void {
  while (b.hits.length > 0 && b.hits[0] <= now - windowMs) b.hits.shift();
}

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { hits: [] };
    buckets.set(key, b);
  }
  prune(b, now, windowMs);
  if (b.hits.length >= limit) {
    const resetMs = b.hits[0] + windowMs - now;
    return { ok: false, remaining: 0, resetMs: Math.max(resetMs, 0) };
  }
  b.hits.push(now);
  return { ok: true, remaining: limit - b.hits.length, resetMs: windowMs };
}

/** Test helper: clear all buckets. */
export function __resetRateLimitsForTests(): void {
  buckets.clear();
}

export function clientKey(request: Request, userId?: string): string {
  const xf = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = xf || "unknown";
  return `${userId ?? "anon"}:${ip}`;
}

/** Common presets (limit, windowMs).
 *
 * Signup uses a roomier per-IP budget than login: an entire campus (shared
 * NAT egress, computer labs, enrollment drives) can legitimately create many
 * accounts from one IP in a short window, and every signup still requires a
 * unique email + username. Mass creation stays bounded (~180/hr/IP); login
 * and password-reset stay strict because they target existing accounts.
 */
export const RATE_PRESETS = {
  login: { limit: 10, windowMs: 60_000 },
  signup: { limit: 30, windowMs: 60_000 * 10 },
  passwordReset: { limit: 5, windowMs: 60_000 * 10 },
  feedback: { limit: 5, windowMs: 60_000 * 60 },
  reports: { limit: 20, windowMs: 60_000 * 60 },
  posts: { limit: 30, windowMs: 60_000 * 10 },
  comments: { limit: 60, windowMs: 60_000 * 10 },
  messages: { limit: 60, windowMs: 60_000 },
  // Reel/video/share toggles: generous for real interaction, bounded against
  // rapid-fire counter abuse.
  reactions: { limit: 120, windowMs: 60_000 * 10 },
  mediaViews: { limit: 240, windowMs: 60_000 * 10 },
  academicWrites: { limit: 90, windowMs: 60_000 * 10 },
  examSubmissions: { limit: 30, windowMs: 60_000 * 10 },
  moderationCalls: { limit: 60, windowMs: 60_000 * 10 },
  uploads: { limit: 30, windowMs: 60_000 * 10 },
  // Search fans out across every text-indexed collection, so it needs a budget.
  search: { limit: 60, windowMs: 60_000 },
  // Group/space creation and membership writes.
  spaces: { limit: 30, windowMs: 60_000 * 10 },
} as const;
