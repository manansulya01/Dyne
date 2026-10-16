/**
 * Discord-like profile tags. Database-backed (stored on users.profileTags)
 * and strictly validated against this allow-list. No arbitrary HTML.
 */
export const PROFILE_TAGS = [
  "TECH",
  "SPORTS",
  "MUSIC",
  "ART",
  "GAMING",
  "SCIENCE",
  "MATHEMATICS",
  "LEADERSHIP",
  "PHOTOGRAPHY",
  "CODING",
  "DRAMA",
  "DANCE",
  "DEBATE",
  "ROBOTICS",
  "ENVIRONMENT",
  "VOLUNTEER",
] as const;

export type ProfileTag = (typeof PROFILE_TAGS)[number];

const SET = new Set<string>(PROFILE_TAGS as readonly string[]);

export function isValidProfileTag(tag: unknown): tag is ProfileTag {
  return typeof tag === "string" && SET.has(tag);
}

/** Sanitize a user-supplied tag list: allow-list only, deduped, max 8. */
export function sanitizeProfileTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== "string") continue;
    const v = t.trim().toUpperCase().slice(0, 24);
    if (SET.has(v) && !out.includes(v)) out.push(v);
    if (out.length >= 8) break;
  }
  return out;
}
