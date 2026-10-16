import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { getAnalytics } from "@/lib/db/productivity";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

/** Real student-productivity analytics, aggregated server-side from the
 *  owner's own data. `range` is 7, 14, or 30 days (default 7). */
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
  const raw = searchParams.get("range");
  const days = raw === "14" ? 14 : raw === "30" ? 30 : 7;
  const data = await getAnalytics(db, user.id, days);
  return NextResponse.json({ analytics: data });
}
