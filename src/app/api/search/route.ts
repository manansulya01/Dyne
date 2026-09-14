import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const escapeLike = (s: string) => s.replace(/[%_\\]/g, (m) => `\\${m}`);

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("q") || "").trim();

  if (!raw || raw.length < 2) {
    return NextResponse.json({
      people: [], posts: [], communities: [], events: [], buildings: [], clubs: [], videos: [],
    });
  }

  const q = escapeLike(raw.slice(0, 100));
  const pattern = `%${q}%`;

  const [people, posts, communities, events, buildings, clubs, videos] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, role")
      .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
      .limit(6),
    supabase
      .from("posts")
      .select("id, content, created_at, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url)")
      .ilike("content", pattern)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("communities")
      .select("id, slug, name, description, image_url")
      .or(`name.ilike.${pattern},description.ilike.${pattern}`)
      .limit(6),
    supabase
      .from("events")
      .select("id, title, description, start_time, image_url")
      .ilike("title", pattern)
      .order("start_time", { ascending: true })
      .limit(6),
    supabase
      .from("campus_buildings")
      .select("id, name, description, image_url")
      .ilike("name", pattern)
      .limit(6),
    supabase
      .from("clubs")
      .select("id, name, description, image_url, category")
      .ilike("name", pattern)
      .limit(6),
    supabase
      .from("videos")
      .select("id, title, description, thumbnail_url, view_count, created_at")
      .eq("is_processed", true)
      .ilike("title", pattern)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  return NextResponse.json({
    people: people.data ?? [],
    posts: posts.data ?? [],
    communities: communities.data ?? [],
    events: events.data ?? [],
    buildings: buildings.data ?? [],
    clubs: clubs.data ?? [],
    videos: videos.data ?? [],
  });
}
