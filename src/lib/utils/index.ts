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