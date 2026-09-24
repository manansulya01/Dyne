import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfilePageClient } from "./ProfilePageClient";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, type UserDoc } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/session";
import { findUserById, findUserByUsername, followCounts, isFollowing } from "@/lib/db/users";
import { toProfileJSON } from "@/lib/db/contracts";

interface Props {
  params: Promise<{ username: string }>;
}

interface ProfileData {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  accent: string | null;
  bio: string | null;
  role: string;
  class_grade: string | null;
  house: string | null;
  interests: string[];
  created_at: string;
  followers_count: number;
  following_count: number;
  is_following: boolean;
  is_own: boolean;
  roles: string[];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `${username} - Dyne`,
    description: `View ${username}'s profile on Dyne`,
  };
}

function toProfileData(
  user: UserDoc,
  counts: { followers: number; following: number },
  extra: { is_following: boolean; is_own: boolean }
): ProfileData {
  const base = toProfileJSON(user as unknown as Record<string, unknown>);
  const created = base.created_at;
  return {
    ...(base as unknown as Omit<ProfileData, "followers_count" | "following_count" | "is_following" | "is_own" | "roles" | "created_at">),
    created_at: created instanceof Date ? created.toISOString() : String(created ?? ""),
    followers_count: counts.followers,
    following_count: counts.following,
    is_following: extra.is_following,
    is_own: extra.is_own,
    roles: [user.role],
  };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const db = await getDb();
  await ensureIndexes(db);
  const sessionUser = await getSessionUser(db);

  if (username === "@me") {
    if (!sessionUser) notFound();
    const profile = await findUserById(db, sessionUser.id);
    if (!profile) notFound();
    const counts = await followCounts(db, profile._id);
    const data = toProfileData(profile, counts, { is_following: false, is_own: true });
    return <ProfilePageClient initialProfile={data} currentUser={data} targetUsername={profile.username} />;
  }

  const targetProfile = await findUserByUsername(db, username);
  if (!targetProfile) notFound();

  const counts = await followCounts(db, targetProfile._id);

  let following = false;
  let currentUserProfile: ProfileData | null = null;

  if (sessionUser) {
    following = await isFollowing(db, sessionUser.id, targetProfile._id);
    const mine = await findUserById(db, sessionUser.id);
    if (mine) {
      const myCounts = await followCounts(db, mine._id);
      currentUserProfile = toProfileData(mine, myCounts, { is_following: false, is_own: false });
    }
  }

  const data = toProfileData(targetProfile, counts, {
    is_following: following,
    is_own: !!sessionUser && sessionUser.id === targetProfile._id.toHexString(),
  });

  return <ProfilePageClient initialProfile={data} currentUser={currentUserProfile} targetUsername={username} />;
}
