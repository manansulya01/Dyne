import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { updateOwnProfile } from "@/lib/db/users";
import { toProfileJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

// Locally-served avatar URLs are relative (/api/files/...); accept those
// plus absolute https URLs.
const avatarSchema = z.object({
  avatarUrl: z.string().max(2000).refine(
    (url) => url.startsWith("/api/files/") || /^https?:\/\/.+/i.test(url),
    "Invalid avatar URL"
  ),
});

export async function PATCH(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const body = await request.json().catch(() => null);
  const validated = avatarSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json({ error: "Invalid avatar URL" }, { status: 400 });
  }

  const updated = await updateOwnProfile(db, user.id, {
    avatarUrl: validated.data.avatarUrl,
  });
  if (!updated) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  return NextResponse.json({
    profile: toProfileJSON(updated as unknown as Record<string, unknown>),
  });
}
