import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { targetUserId } = body;

  if (!targetUserId) {
    return NextResponse.json({ error: "Target user ID required" }, { status: 400 });
  }

  if (targetUserId === user.id) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", targetUserId)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("follows")
    .insert({
      follower_id: user.id,
      following_id: targetUserId,
    });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already following" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase
    .from("notifications")
    .insert({
      recipient_id: targetUserId,
      actor_id: user.id,
      type: "follow",
      title: "New follower",
      message: "started following you",
    });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let targetUserId = searchParams.get("targetUserId");

  // Accept JSON body as well (client sends body for unfollow).
  if (!targetUserId) {
    try {
      const body = await request.json();
      targetUserId = body?.targetUserId ?? null;
    } catch {
      // no body — fall through to 400 below
    }
  }

  if (!targetUserId) {
    return NextResponse.json({ error: "Target user ID required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("following_id", targetUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") || user.id;
  const type = searchParams.get("type") || "followers";
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  let query = supabase
    .from("follows")
    .select(`
      *,
      follower:profiles!follows_follower_id_fkey(id, username, display_name, avatar_url),
      following:profiles!follows_following_id_fkey(id, username, display_name, avatar_url)
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type === "followers") {
    query = query.eq("following_id", userId);
  } else {
    query = query.eq("follower_id", userId);
  }

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: follows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profiles = follows?.map(f => type === "followers" ? f.follower : f.following).filter(Boolean) || [];

  return NextResponse.json({ profiles });
}