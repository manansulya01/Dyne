import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { profileUpdateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") || user.id;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { count: followersCount } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", userId);

  const { count: followingCount } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", userId);

  let isFollowing = false;
  if (userId !== user.id) {
    const { data: follow } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", userId)
      .single();
    isFollowing = !!follow;
  }

  const roles = await supabase
    .from("user_roles")
    .select("role:roles!inner(name)")
    .eq("user_id", userId);

  type RoleRow = { role: { name: string } };
  const roleNames = (roles.data as RoleRow[] | null)?.map(r => r.role?.name).filter(Boolean) || [];

  return NextResponse.json({
    profile: {
      ...profile,
      followers_count: followersCount || 0,
      following_count: followingCount || 0,
      is_following: isFollowing,
      is_own: userId === user.id,
      roles: roleNames,
    },
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const validated = profileUpdateSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (validated.data.displayName !== undefined) updatePayload.display_name = validated.data.displayName;
  if (validated.data.bio !== undefined) updatePayload.bio = validated.data.bio;
  if (validated.data.classGrade !== undefined) updatePayload.class_grade = validated.data.classGrade;
  if (validated.data.house !== undefined) updatePayload.house = validated.data.house;
  if (validated.data.interests !== undefined) updatePayload.interests = validated.data.interests;

  const { data: profile, error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile });
}