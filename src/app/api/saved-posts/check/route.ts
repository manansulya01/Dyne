import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { isPostSaved } from "@/lib/db/reactions";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

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
  const postId = searchParams.get("postId");

  if (!postId || !objectIdSchema.safeParse(postId).success) {
    return NextResponse.json({ error: "Post ID required" }, { status: 400 });
  }

  return NextResponse.json({ saved: await isPostSaved(db, user.id, postId) });
}
