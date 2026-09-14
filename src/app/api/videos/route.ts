import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const videoCreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  videoUrl: z.string().url().max(2000),
  thumbnailUrl: z.string().url().max(2000).optional(),
  category: z.string().max(50).optional(),
  duration: z.number().int().nonnegative().optional(),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const category = searchParams.get("category");
  const mine = searchParams.get("mine") === "true";
  const sort = searchParams.get("sort") === "popular" ? "view_count" : "created_at";

  let query = supabase
    .from("videos")
    .select(`
      *,
      creator:profiles!videos_creator_id_fkey(id, username, display_name, avatar_url)
    `)
    .order(sort, { ascending: false })
    .limit(limit);

  if (mine) {
    query = query.eq("creator_id", user.id);
  } else {
    // Public catalog shows processed videos; creators always see their own drafts.
    query = query.or(`is_processed.eq.true,creator_id.eq.${user.id}`);
  }

  if (category) query = query.eq("category", category);
  if (cursor) query = query.lt(sort, cursor);

  const { data: videos, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    videos: videos ?? [],
    cursor: videos?.[videos.length - 1]?.[sort] ?? null,
    hasMore: (videos?.length ?? 0) === limit,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const validated = videoCreateSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { data: video, error } = await supabase
    .from("videos")
    .insert({
      title: validated.data.title,
      description: validated.data.description ?? null,
      video_url: validated.data.videoUrl,
      thumbnail_url: validated.data.thumbnailUrl ?? null,
      category: validated.data.category ?? null,
      duration: validated.data.duration ?? null,
      creator_id: user.id,
      is_processed: true,
    })
    .select(`
      *,
      creator:profiles!videos_creator_id_fkey(id, username, display_name, avatar_url)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ video });
}
