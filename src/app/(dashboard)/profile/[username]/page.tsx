import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfilePageClient } from "./ProfilePageClient";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ username: string }>;
}

interface ProfileData {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
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

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (username === "@me") {
    if (!user) notFound();
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (!profile) notFound();

    const { count: followersCount } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", profile.id);

    const { count: followingCount } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", profile.id);

    const roles = await supabase
      .from("user_roles")
      .select("role:roles!inner(name)")
      .eq("user_id", profile.id);

    type RoleRow = { role: { name: string } };
    const roleNames = (roles.data as RoleRow[] | null)?.map(r => r.role?.name).filter(Boolean) || [];

    const currentUserProfile: ProfileData = {
      ...profile,
      followers_count: followersCount || 0,
      following_count: followingCount || 0,
      is_following: false,
      is_own: true,
      roles: roleNames,
    };

    return <ProfilePageClient initialProfile={currentUserProfile} currentUser={currentUserProfile} targetUsername={profile.username} />;
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (!targetProfile) notFound();

  const { count: followersCount } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", targetProfile.id);

  const { count: followingCount } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", targetProfile.id);

  let isFollowing = false;
  let currentUserProfile: ProfileData | null = null;

  if (user) {
    const { data: follow } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", targetProfile.id)
      .single();
    isFollowing = !!follow;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      const { count: cf } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", profile.id);

      const { count: cg } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", profile.id);

      const roles = await supabase
        .from("user_roles")
        .select("role:roles!inner(name)")
        .eq("user_id", profile.id);

      type RoleRow = { role: { name: string } };
      const roleNames = (roles.data as RoleRow[] | null)?.map(r => r.role?.name).filter(Boolean) || [];

      currentUserProfile = {
        ...profile,
        followers_count: cf || 0,
        following_count: cg || 0,
        is_following: false,
        is_own: false,
        roles: roleNames,
      };
    }
  }

  const roles = await supabase
    .from("user_roles")
    .select("role:roles!inner(name)")
    .eq("user_id", targetProfile.id);

  type RoleRow = { role: { name: string } };
  const targetRoleNames = (roles.data as RoleRow[] | null)?.map(r => r.role?.name).filter(Boolean) || [];

  const targetProfileData: ProfileData = {
    ...targetProfile,
    followers_count: followersCount || 0,
    following_count: followingCount || 0,
    is_following: isFollowing,
    is_own: false,
    roles: targetRoleNames,
  };

  return <ProfilePageClient initialProfile={targetProfileData} currentUser={currentUserProfile} targetUsername={username} />;
}