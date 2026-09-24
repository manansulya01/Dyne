import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import {
  destroySession,
  SESSION_COOKIE,
  clearedSessionCookieOptions,
} from "@/lib/auth/session";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await destroySession(db, token);
  }
  store.set(SESSION_COOKIE, "", clearedSessionCookieOptions());
  return NextResponse.json({ success: true });
}
