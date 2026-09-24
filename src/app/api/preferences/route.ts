import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { preferencesSchema } from "@/lib/validation";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

/** Per-user preferences stored on the user document (schemaless-safe, additive). */
const DEFAULT_PREFS = {
  emailNotifications: true,
  pushNotifications: false,
  notifySocial: true,
  notifyMessages: true,
  notifyCommunities: true,
  notifyEvents: true,
  profileVisibility: "campus",
  messagePermissions: "everyone",
  activityVisibility: "everyone",
};

export async function GET() {
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try { user = await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  const row = await col(db, "users").findOne({ _id: toObjectId(user.id) } as never);
  const stored = (row?.preferences ?? {}) as Record<string, unknown>;
  return NextResponse.json({ preferences: { ...DEFAULT_PREFS, ...stored } });
}

export async function PATCH(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try { user = await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  const body = await request.json().catch(() => null);
  const validated = preferencesSchema.safeParse(body);
  if (!validated.success) return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  const row = await col(db, "users").findOne({ _id: toObjectId(user.id) } as never);
  const merged = { ...DEFAULT_PREFS, ...((row?.preferences ?? {}) as Record<string, unknown>), ...validated.data };
  await col(db, "users").updateOne({ _id: toObjectId(user.id) } as never, { $set: { preferences: merged, updatedAt: new Date() } });
  return NextResponse.json({ preferences: merged });
}
