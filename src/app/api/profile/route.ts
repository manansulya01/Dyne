import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { profileUpdateSchema } from "@/lib/validation";
import { objectIdSchema } from "@/lib/mongo/ids";
import { findUserById, followCounts, isFollowing, updateOwnProfile } from "@/lib/db/users";
import { toProfileJSON } from "@/lib/db/contracts";
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
  const rawId = searchParams.get("userId") || user.id;
  if (!objectIdSchema.safeParse(rawId).success) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const profile = await findUserById(db, rawId);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const [counts, following] = await Promise.all([
    followCounts(db, profile._id),
    rawId === user.id ? Promise.resolve(false) : isFollowing(db, user.id, profile._id),
  ]);

  return NextResponse.json({
    profile: {
      ...toProfileJSON(profile as unknown as Record<string, unknown>),
      followers_count: counts.followers,
      following_count: counts.following,
      is_following: following,
      is_own: rawId === user.id,
      roles: [profile.role],
    },
  });
}

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
  const validated = profileUpdateSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const updated = await updateOwnProfile(db, user.id, {
    displayName: validated.data.displayName,
    bio: validated.data.bio,
    classGrade: validated.data.classGrade,
    house: validated.data.house,
    interests: validated.data.interests,
    coverImageUrl: validated.data.coverImageUrl,
    accent: validated.data.accent,
  });

  if (!updated) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({ profile: toProfileJSON(updated as unknown as Record<string, unknown>) });
}
