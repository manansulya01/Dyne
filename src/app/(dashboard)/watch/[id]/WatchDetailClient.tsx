"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { formatRelativeTime } from "@/lib/utils";
import { Heart, Trash2 } from "lucide-react";

interface VideoDetail {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  creator_id: string;
  view_count: number;
  category: string | null;
  created_at: string;
  creator: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
}

export function WatchDetailClient({ video, more, currentUserId }: {
  video: VideoDetail;
  more: Array<{ id: string; title: string; thumbnail_url: string | null; view_count: number; video_url: string }>;
  currentUserId: string | null;
}) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/reactions?targetType=video&targetId=${video.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setLiked(!!data.userReaction);
          const total = Object.values((data.counts ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
          setLikeCount(total);
        }
      })
      .catch(() => {});
    // Record the view server-side.
    fetch(`/api/videos/${video.id}`).catch(() => {});
  }, [video.id]);

  const toggleLike = async () => {
    if (!currentUserId) return;
    const was = liked;
    setLiked(!was);
    setLikeCount((c) => c + (was ? -1 : 1));
    const res = was
      ? await fetch(`/api/reactions?targetType=video&targetId=${video.id}&reactionType=like`, { method: "DELETE" })
      : await fetch("/api/reactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetType: "video", targetId: video.id, reactionType: "like" }),
        });
    if (!res.ok) {
      setLiked(was);
      setLikeCount((c) => c + (was ? 1 : -1));
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this video?")) return;
    const res = await fetch(`/api/videos/${video.id}`, { method: "DELETE" });
    if (res.ok) router.push("/watch");
  };

  return (
    <div className="max-w-5xl mx-auto p-4 grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4 min-w-0">
        <div className="rounded-xl overflow-hidden bg-black aspect-video">
          <video src={video.video_url} controls playsInline preload="metadata" className="h-full w-full" aria-label={video.title} />
        </div>
        <div>
          <h1 className="text-xl font-bold break-words">{video.title}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Avatar className="h-9 w-9">
              <AvatarImage src={video.creator?.avatar_url || ""} alt="" />
              <AvatarFallback name={video.creator?.display_name || video.creator?.username} />
            </Avatar>
            <Link href={video.creator ? `/profile/${video.creator.username}` : "#"} className="text-sm font-medium min-h-[44px] flex items-center">
              {video.creator?.display_name || video.creator?.username}
            </Link>
            <span className="text-sm text-muted-foreground">{video.view_count} views · {formatRelativeTime(video.created_at)}</span>
            <span className="ml-auto flex gap-2">
              <Button variant={liked ? "default" : "outline"} size="sm" className="min-h-[44px]" onClick={toggleLike} aria-pressed={liked}>
                <Heart className="h-4 w-4 mr-1" aria-hidden="true" /> {likeCount}
              </Button>
              {currentUserId === video.creator_id && (
                <Button variant="ghost" size="sm" className="min-h-[44px] text-destructive" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" /> Delete
                </Button>
              )}
            </span>
          </div>
          {video.description && (
            <Card className="mt-3">
              <CardContent className="pt-3">
                <p className="text-sm whitespace-pre-wrap break-words">{video.description}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <aside className="space-y-3">
        <h2 className="font-semibold">More to watch</h2>
        {more.map((m) => (
          <Link key={m.id} href={`/watch/${m.id}`} className="flex gap-3 rounded-lg p-1 min-h-[64px] hover:bg-accent">
            <div className="relative w-36 aspect-video rounded-md overflow-hidden bg-muted shrink-0">
              {m.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              ) : (
                <video src={m.video_url} preload="metadata" muted playsInline className="absolute inset-0 h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium line-clamp-2">{m.title}</p>
              <p className="text-xs text-muted-foreground">{m.view_count} views</p>
            </div>
          </Link>
        ))}
        {more.length === 0 && <p className="text-sm text-muted-foreground">No other videos yet.</p>}
      </aside>
    </div>
  );
}
