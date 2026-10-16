import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { requireAdminUser } from "../stats/route";
import { requirePermission } from "@/lib/permissions";

async function requireAdminWithPerm(db: unknown, permission: string) {
  const admin = await requireAdminUser(db as never);
  requirePermission(admin.role, permission as never);
  return admin;
}

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireAdminWithPerm(db, "audit.view");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 50, 100);
  const targetType = searchParams.get("targetType");
  const action = searchParams.get("action");
  const moderatorId = searchParams.get("moderatorId");
  const source = searchParams.get("source");

  const filter: Record<string, unknown> = {};
  if (targetType) filter.targetType = targetType;
  if (action) filter.action = action;
  if (moderatorId && objectIdSchema.safeParse(moderatorId).success) {
    filter.moderatorId = toObjectId(moderatorId);
  }
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) filter.createdAt = { $lt: parsed };
  }

  /**
   * Two append-only trails are kept: `auditLogs` records privileged actions
   * (role changes, bans, resets, report views, publishing) and
   * `moderationActions` records content-moderation decisions. The audit log
   * view is a merged, reverse-chronological stream of both so a moderator or
   * admin sees every auditable event in one place. `?source=` narrows it.
   */
  const wantAudit = source !== "moderation";
  const wantModeration = source !== "audit";

  const [auditRows, moderationRows] = await Promise.all([
    wantAudit
      ? col(db, "auditLogs")
          .find(filter as never)
          .sort({ createdAt: -1, _id: -1 })
          .limit(limit)
          .toArray()
      : Promise.resolve([] as Record<string, unknown>[]),
    wantModeration
      ? col(db, "moderationActions")
          .find(filter as never)
          .sort({ createdAt: -1, _id: -1 })
          .limit(limit)
          .toArray()
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  const tagged: Array<Record<string, unknown>> = [
    ...auditRows.map((r) => ({ ...(r as Record<string, unknown>), source: "audit" })),
    ...moderationRows.map((r) => ({ ...(r as Record<string, unknown>), source: "moderation" })),
  ];
  const merged = tagged
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const at = new Date(a.createdAt as string).getTime();
      const bt = new Date(b.createdAt as string).getTime();
      return bt - at;
    })
    .slice(0, limit);

  return NextResponse.json({ actions: merged, nextCursor: merged.length === limit ? merged[merged.length - 1]?.createdAt ?? null : null });
}