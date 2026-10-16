import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { studySessionCreateSchema } from "@/lib/validation";
import { getStudySession, listStudySessions, startStudySession } from "@/lib/db/productivity";
import { toStudySessionJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import { rateLimit, clientKey } from "@/lib/security/rateLimit";
import type { StudySessionStatus } from "@/lib/mongo/collections";

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

const STATUSES: StudySessionStatus[] = ["active", "paused", "completed", "cancelled"];

export async function GET(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get("status");
  const status = rawStatus && (STATUSES as string[]).includes(rawStatus)
    ? (rawStatus as StudySessionStatus) : undefined;
  const parseDate = (raw: string | null): Date | undefined => {
    if (!raw) return undefined;
    const d = new Date(raw);
    return isNaN(+d) ? undefined : d;
  };
  const rows = await listStudySessions(db, user.id, {
    status,
    from: parseDate(searchParams.get("from")),
    to: parseDate(searchParams.get("to")),
    limit: parseLimitParam(searchParams.get("limit"), 20, 100),
  });
  return NextResponse.json({
    sessions: rows.map((s) => toStudySessionJSON(s as unknown as Record<string, unknown>)),
  });
}

/** Start a session. At most one active/paused session per user (409 otherwise). */
export async function POST(request: Request) {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const rl = rateLimit(`sessions:${clientKey(request, user.id)}`, 60, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const validated = studySessionCreateSchema.safeParse(body ?? {});
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const created = await startStudySession(db, user.id, {
    courseId: validated.data.courseId,
    subject: validated.data.subject,
    note: validated.data.note,
  });
  if (!created.ok) {
    if (created.reason === "already_active") {
      return NextResponse.json({ error: "A study session is already in progress" }, { status: 409 });
    }
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  const row = await getStudySession(db, user.id, created.sessionId);
  return NextResponse.json(
    { session: row ? toStudySessionJSON(row as unknown as Record<string, unknown>) : { id: created.sessionId.toHexString() } },
    { status: 201 }
  );
}
