import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role:roles!inner(name)")
    .eq("user_id", userId)
    .eq("roles.name", "admin");
  return (data?.length ?? 0) > 0;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: video, error } = await supabase
    .from("videos")
    .select(`
      *,
      creator:profiles!videos_creator_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq("id", id)
    .single();

  if (error || !video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  if (!video.is_processed && video.creator_id !== user.id) {
    return NextResponse.json({ error: "Video not available" }, { status: 403 });
  }

  // Record a view (best-effort), throttled to one counted view per user per
  // hour to prevent obvious view-count abuse.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentView } = await supabase
    .from("video_views")
    .select("id")
    .eq("video_id", id)
    .eq("user_id", user.id)
    .gte("created_at", oneHourAgo)
    .limit(1)
    .single();

  let viewCount = video.view_count ?? 0;
  if (!recentView) {
    await supabase.from("video_views").insert({
      video_id: id,
      user_id: user.id,
      watched_duration: 0,
    });
    viewCount += 1;
    await supabase.from("videos").update({ view_count: viewCount }).eq("id", id);
  }

  return NextResponse.json({ video: { ...video, view_count: viewCount } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const { data: video } = await supabase
    .from("videos")
    .select("creator_id")
    .eq("id", id)
    .single();

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  if (video.creator_id !== user.id && !(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") updatePayload.title = body.title.slice(0, 200);
  if (typeof body.description === "string" || body.description === null)
    updatePayload.description = body.description;
  if (typeof body.category === "string" || body.category === null)
    updatePayload.category = body.category;
  if (typeof body.thumbnail_url === "string" || body.thumbnail_url === null)
    updatePayload.thumbnail_url = body.thumbnail_url;

  const { data: updated, error } = await supabase
    .from("videos")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ video: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: video } = await supabase
    .from("videos")
    .select("creator_id")
    .eq("id", id)
    .single();

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  if (video.creator_id !== user.id && !(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
