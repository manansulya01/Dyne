import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { feedbackCreateSchema, FEEDBACK_STATUSES, FEEDBACK_CATEGORIES } from "@/lib/validation";
import { createFeedback, listFeedback } from "@/lib/db/feedback";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import { rateLimit, clientKey, RATE_PRESETS, __resetRateLimitsForTests } from "@/lib/security/rateLimit";
import type { FeedbackStatus, FeedbackCategory } from "@/lib/mongo/collections";

export { __resetRateLimitsForTests };

export async function POST(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  const rl = rateLimit(`feedback:${clientKey(request, user.id)}`, RATE_PRESETS.feedback.limit, RATE_PRESETS.feedback.windowMs);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const validated = feedbackCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const created = await createFeedback(db, user.id, validated.data);
  return NextResponse.json({ success: true, id: created.feedbackId.toHexString() });
}

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  const { searchParams } = new URL(request.url);
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const search = searchParams.get("search")?.slice(0, 100) || undefined;
  const sort = searchParams.get("sort") === "oldest" ? "oldest" : "newest";
  const cursor = searchParams.get("cursor");
  let before: Date | undefined;
  if (cursor) {
    const p = new Date(cursor);
    if (!isNaN(+p)) before = p;
  }
  const { items, isStaff } = await listFeedback(db, user.id, user.role, {
    status: status && (FEEDBACK_STATUSES as readonly string[]).includes(status) ? (status as FeedbackStatus) : undefined,
    category: category && (FEEDBACK_CATEGORIES as readonly string[]).includes(category) ? (category as FeedbackCategory) : undefined,
    search,
    limit,
    before,
    sort,
  });
  return NextResponse.json({ feedback: items, isStaff });
}
