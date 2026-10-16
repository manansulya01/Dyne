import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import {
  getSessionUser,
  requireSessionUser,
  toHttpError,
  type SessionUser,
} from "@/lib/auth/session";
import {
  requireAnyPermission,
  requirePermission,
  type Permission,
} from "@/lib/permissions";
import { rateLimit, clientKey, RATE_PRESETS } from "./rateLimit";

/**
 * Single entry point for privileged API authorization.
 *
 * Every privileged route in Dyne authenticates + authorizes through one of
 * these helpers so the security boundary is defined once. Route handlers must
 * never branch on a client-supplied role, teacherId, or studentId.
 */

export interface AuthedContext {
  db: Db;
  user: SessionUser;
}

/** db + indexes ensured, session required. */
export async function withUser(): Promise<
  { ok: true; ctx: AuthedContext } | { ok: false; response: NextResponse }
> {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    return { ok: true, ctx: { db, user } };
  } catch (err) {
    return { ok: false, response: NextResponse.json({ error: toHttpError(err).message }, { status: toHttpError(err).status }) };
  }
}

/** db + indexes ensured, session required, one permission required. */
export async function withPermission(
  permission: Permission
): Promise<{ ok: true; ctx: AuthedContext } | { ok: false; response: NextResponse }> {
  const base = await withUser();
  if (!base.ok) return base;
  try {
    requirePermission(base.ctx.user.role, permission);
    return base;
  } catch (err) {
    const { status, message } = toHttpError(err);
    return { ok: false, response: NextResponse.json({ error: message }, { status }) };
  }
}

/** db + indexes ensured, session required, at least one of the permissions. */
export async function withAnyPermission(
  permissions: Permission[]
): Promise<{ ok: true; ctx: AuthedContext } | { ok: false; response: NextResponse }> {
  const base = await withUser();
  if (!base.ok) return base;
  try {
    requireAnyPermission(base.ctx.user.role, permissions);
    return base;
  } catch (err) {
    const { status, message } = toHttpError(err);
    return { ok: false, response: NextResponse.json({ error: message }, { status }) };
  }
}

/** Optional session (public pages that personalize). Never throws. */
export async function optionalUser(): Promise<{ db: Db; user: SessionUser | null }> {
  const db = await getDb();
  await ensureIndexes(db);
  return { db, user: await getSessionUser(db) };
}

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function jsonFieldError(status: number, fieldErrors: unknown): NextResponse {
  return NextResponse.json({ error: fieldErrors }, { status });
}

/** 429 with a friendly message (rate-limit preset chosen by the caller). */
export function rateLimited(): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429 }
  );
}

/** Apply a named rate-limit preset for a mutating request. */
export function guardRate(
  request: Request,
  userId: string,
  preset: keyof typeof RATE_PRESETS
): NextResponse | null {
  const p = RATE_PRESETS[preset];
  const rl = rateLimit(`${preset}:${clientKey(request, userId)}`, p.limit, p.windowMs);
  return rl.ok ? null : rateLimited();
}
