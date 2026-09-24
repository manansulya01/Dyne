import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { reportCreateSchema } from "@/lib/validation";
import { createReport, listReports } from "@/lib/db/reports";
import { toReportJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import type { ReportStatus } from "@/lib/mongo/collections";

async function authed() {
  const db = await getDb();
  await ensureIndexes(db);
  try {
    const user = await requireSessionUser(db);
    return { db, user };
  } catch (err) {
    const { status, message } = toHttpError(err);
    return { db, error: NextResponse.json({ error: message }, { status }) };
  }
}

export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await request.json().catch(() => null);
  const validated = reportCreateSchema.safeParse({
    targetType: body?.targetType,
    targetId: body?.targetId,
    reason: body?.reason,
    description: body?.description,
  });

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const created = await createReport(db, user.id, {
    targetType: validated.data.targetType,
    targetId: validated.data.targetId,
    reason: validated.data.reason,
    description: validated.data.description,
  });
  if (!created.ok) {
    if (created.reason === "not_found") {
      return NextResponse.json({ error: "Reported content not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

export async function GET(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);
  let before: Date | undefined;
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) before = parsed;
  }

  const validStatus: ReportStatus[] = ["pending", "reviewing", "resolved", "dismissed"];
  const { reports, isModerator } = await listReports(db, user.id, user.role, {
    status: status && (validStatus as string[]).includes(status) ? (status as ReportStatus) : undefined,
    limit,
    before,
  });

  return NextResponse.json({
    reports: reports.map((r) => toReportJSON(r as unknown as Record<string, unknown>)),
    isModerator,
  });
}
