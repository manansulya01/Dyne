import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length).trim() + "...";
}

/** Human file sizes: 0 B, 1.2 KB, 3.4 MB … (never NaN/negative). */
export function formatBytes(size: unknown): string {
  const n = typeof size === "number" && Number.isFinite(size) && size >= 0 ? size : 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[u]}`;
}

/** Estimated reading time for campus articles ("3 min read"). */
export function readingTime(text: unknown, wordsPerMinute = 200): string {
  const words = typeof text === "string" ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  const mins = Math.max(1, Math.round(words / wordsPerMinute));
  return `${mins} min read`;
}

/**
 * Parse a `?limit=` query param into a safe positive integer.
 * Non-numeric, zero, and negative inputs fall back to `fallback`;
 * values above `max` are clamped. Never returns NaN/0/negative, so it is
 * always safe to pass directly to a Mongo `.limit()` call.
 */
export function parseLimitParam(
  raw: string | null,
  fallback = 20,
  max = 50
): number {
  const parsed = parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

/**
 * Clamp an already-parsed limit for direct use in a Mongo `.limit()` call.
 * Guards library internals against NaN/negative/huge values even when
 * callers forget to use parseLimitParam.
 */
export function safeLimit(limit: unknown, max = 50, fallback = 20): number {
  return typeof limit === "number" && Number.isFinite(limit) && limit > 0
    ? Math.min(Math.floor(limit), max)
    : fallback;
}

/**
 * Human-readable message from a failed API response.
 * Handles both shapes the app returns: `{ error: "..." }` and
 * `{ error: { field: ["..."] } }` (Zod fieldErrors). Falls back to a
 * caller-supplied message so the user never sees raw internals.
 */
export async function apiErrorMessage(
  res: Response,
  fallback: string
): Promise<string> {
  try {
    const data: unknown = await res.clone().json();
    if (typeof data === "object" && data !== null && "error" in data) {
      const err = (data as { error: unknown }).error;
      if (typeof err === "string" && err.trim()) return err;
      if (typeof err === "object" && err !== null) {
        const first = Object.values(err as Record<string, unknown>)
          .flatMap((v) => (Array.isArray(v) ? v : [v]))
          .find((v): v is string => typeof v === "string" && v.trim().length > 0);
        if (first) return first;
      }
    }
  } catch {
    /* non-JSON body (HTML error page, empty 502) — use the fallback */
  }
  return fallback;
}

/**
 * Guarded multipart/form-data reader for API routes.
 * `request.formData()` throws on non-form bodies (JSON, empty, wrong
 * content-type) — without this guard those requests become unhandled 500s.
 * Returns `null` so callers can answer 400 instead.
 */
export async function readFormData(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}