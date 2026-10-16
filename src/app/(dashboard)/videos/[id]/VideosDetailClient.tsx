"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { formatRelativeTime } from "@/lib/utils";
import { ArrowLeft, Flag, Heart, Share2, Trash2 } from "lucide-react";

interface VideoItem {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  creator_id: string;
  creator: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
  view_count: number;
  like_count: number;
  category: string | null;
  orientation: "horizontal" | "vertical";
  aspect_ratio: string | null;
  moderation_status: string;
  moderation_reason: string | null;
  created_at: string;
  liked_by_viewer: boolean;
}

export function VideosDetailClient({
  video,
  more,
  currentUserId,
  isOwner,
  canModerate,
}: {
  video: VideoItem;
  more: VideoItem[];
  currentUserId: string | null;
  isOwner: boolean;
  canModerate: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(video.liked_by_viewer);
  const [likeCount, setLikeCount] = useState(video.like_count);
  const [notice, setNotice] = useState<string | null>(null);

  // Record the view server-side (throttled to one per hour per user).
  useEffect(() => {
    if (currentUserId) fetch(`/api/videos/${video.id}`).catch(() => {});
  }, [video.id, currentUserId]);

  const toggleLike = async () => {
    if (!currentUserId) {
      setNotice("Sign in to like videos.");
      return;
    }
    const wantsLiked = !liked;
    setLiked(wantsLiked);
    setLikeCount((c) => c + (wantsLiked ? 1 : -1));
    try {
      const res = await fetch(`/api/videos/${video.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: wantsLiked ? "like" : "unlike" }),
      });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setLikeCount(data.like_count);
      } else {
        setLiked(!wantsLiked);
        setLikeCount((c) => c + (wantsLiked ? -1 : 1));
      }
    } catch {
      setLiked(!wantsLiked);
      setLikeCount((c) => c + (wantsLiked ? -1 : 1));
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/videos/${video.id}`;
    try {
      if (navigator.share) await navigator.share({ title: video.title, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* cancelled */
    }
  };

  const report = async () => {
    const reason = window.prompt("Why are you reporting this video?");
    if (!reason) return;
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "video",
        targetId: video.id,
        reason: reason.slice(0, 100),
      }),
    });
    setNotice(res.ok ? "Thanks — a moderator will review this." : "Could not submit the report.");
  };

  const remove = async () => {
    if (!window.confirm("Delete this video?")) return;
    const res = await fetch(`/api/videos/${video.id}`, { method: "DELETE" });
    if (res.ok) router.push("/videos");
    else setNotice("Could not delete this video.");
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-3 pb-8 pt-4 sm:px-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
          <Link href="/videos">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All videos
          </Link>
        </Button>

        <div className="aspect-video overflow-hidden rounded-xl bg-black">
          <video
            src={video.video_url}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full"
            aria-label={video.title}
          />
        </div>

        {notice && (
          <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
            {notice}
          </p>
        )}

        <div>
          <h1 className="break-words text-xl font-bold">{video.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={video.creator?.avatar_url || ""} alt="" />
              <AvatarFallback name={video.creator?.display_name || video.creator?.username} />
            </Avatar>
            {video.creator ? (
              <Link
                href={`/profile/${video.creator.username}`}
                className="flex min-h-[44px] items-center text-sm font-medium"
              >
                {video.creator.display_name || video.creator.username}
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">Unknown creator</span>
            )}
            <span className="text-sm text-muted-foreground">
              {video.view_count.toLocaleString()} views · {formatRelativeTime(video.created_at)}
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              <Button
                variant={liked ? "default" : "outline"}
                size="sm"
                className="min-h-[44px]"
                onClick={toggleLike}
                aria-pressed={liked}
              >
                <Heart className="h-4 w-4" aria-hidden="true" /> {likeCount}
              </Button>
              <Button variant="outline" size="sm" className="min-h-[44px]" onClick={share}>
                <Share2 className="h-4 w-4" aria-hidden="true" /> Share
              </Button>
              {currentUserId && (
                <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={report}>
                  <Flag className="h-4 w-4" aria-hidden="true" /> Report
                </Button>
              )}
              {(isOwner || canModerate) && (
                <Button variant="ghost" size="sm" className="min-h-[44px] text-destructive" onClick={remove}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                </Button>
              )}
            </span>
          </div>

          {video.moderation_status !== "approved" && (
            <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              Moderation status: {video.moderation_status}
              {video.moderation_reason ? ` — ${video.moderation_reason}` : ""}. This video is not in the
              public library.
            </p>
          )}

          {video.description && (
            <Card className="mt-3">
              <CardContent className="pt-3">
                <p className="whitespace-pre-wrap break-words text-sm">{video.description}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <aside className="space-y-3">
        <h2 className="font-semibold">More to watch</h2>
        {more.map((m) => (
          <Link
            key={m.id}
            href={`/videos/${m.id}`}
            className="flex min-h-[64px] gap-3 rounded-lg p-1 hover:bg-accent"
          >
            <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-md bg-muted">
              {m.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- app-served media
                <img
                  src={m.thumbnail_url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <video
                  src={m.video_url}
                  preload="metadata"
                  muted
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-medium">{m.title}</p>
              <p className="text-xs text-muted-foreground">{m.view_count.toLocaleString()} views</p>
            </div>
          </Link>
        ))}
        {more.length === 0 && <p className="text-sm text-muted-foreground">No other videos yet.</p>}
      </aside>
    </div>
  );
}
