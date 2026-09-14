import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WatchDetailClient } from "./WatchDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: video } = await supabase
    .from("videos")
    .select("title, description")
    .eq("id", id)
    .single();

  return {
    title: video ? `${video.title} — Dyne Watch` : "Video — Dyne Watch",
    description: video?.description?.slice(0, 160) ?? "Watch campus videos on Dyne.",
  };
}

export default async function WatchDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: video } = await supabase
    .from("videos")
    .select(`
      *,
      creator:profiles!videos_creator_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq("id", id)
    .single();

  if (!video) notFound();
  if (!video.is_processed && video.creator_id !== user?.id) notFound();

  const { data: more } = await supabase
    .from("videos")
    .select("id, title, thumbnail_url, view_count, video_url")
    .eq("is_processed", true)
    .neq("id", id)
    .order("created_at", { ascending: false })
    .limit(6);

  return (
    <WatchDetailClient
      video={video}
      more={more ?? []}
      currentUserId={user?.id ?? null}
    />
  );
}
