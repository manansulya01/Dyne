"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { cn, formatRelativeTime } from "@/lib/utils";
import { ArrowLeft, Flag, Heart, Pause, Play, Share2, Trash2, Volume2, VolumeX } from "lucide-react";

interface Reel {
  id: string;
  title: string;
  caption: string | null;
  video_url: string;
  thumbnail_url: string | null;
  creator_id: string;
  creator: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
  view_count: number;
  like_count: number;
  save_count: number;
  share_count: number;
  category: string | null;
  hashtags: string[];
  aspect_ratio: string | null;
  width: number | null;
  height: number | null;
  moderation_status: string;
  moderation_reason: string | null;
  created_at: string;
  liked_by_viewer: boolean;
}

export function ReelDetailClient({
  reel,
  currentUserId,
  isOwner,
  canModerate,
}: {
  reel: Reel;
  currentUserId: string | null;
  isOwner: boolean;
  canModerate: boolean;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [liked, setLiked] = useState(reel.liked_by_viewer);
  const [likeCount, setLikeCount] = useState(reel.like_count);
  const [shareCount, setShareCount] = useState(reel.share_count);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const toggleLike = async () => {
    if (!currentUserId) {
      setNotice("Sign in to like reels.");
      return;
    }
    const wantsLiked = !liked;
    setLiked(wantsLiked);
    setLikeCount((c) => c + (wantsLiked ? 1 : -1));
    try {
      const res = await fetch(`/api/reels/${reel.id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: wantsLiked ? "like" : "unlike" }),
      });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setLikeCount(data.like_count);
      }
    } catch {
      setLiked(!wantsLiked);
      setLikeCount((c) => c + (wantsLiked ? -1 : 1));
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/reels/${reel.id}`;
    try {
      if (navigator.share) await navigator.share({ title: reel.title, url });
      else await navigator.clipboard.writeText(url);
      const res = await fetch(`/api/reels/${reel.id}/share`, { method: "POST" });
      if (res.ok) setShareCount((await res.json()).share_count);
    } catch {
      /* cancelled */
    }
  };

  const report = async () => {
    const reason = window.prompt("Why are you reporting this reel?");
    if (!reason) return;
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "reel",
        targetId: reel.id,
        reason: reason.slice(0, 100),
      }),
    });
    setNotice(res.ok ? "Thanks — a moderator will review this." : "Could not submit the report.");
  };

  const remove = async () => {
    if (!window.confirm("Delete this reel?")) return;
    const res = await fetch(`/api/reels/${reel.id}`, { method: "DELETE" });
    if (res.ok) router.push("/reels");
    else setNotice("Could not delete this reel.");
  };

  const toggleSave = async () => {
    if (!currentUserId) {
      setNotice("Sign in to save reels.");
      return;
    }
    const next = !saved;
    setSaved(next);
    const res = await fetch(`/api/reels/${reel.id}/save`, { method: next ? "POST" : "DELETE" });
    if (!res.ok) setSaved(!next);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
        <Link href="/reels">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to reels
        </Link>
      </Button>

      {notice && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
          {notice}
        </p>
      )}

      <div className="relative mx-auto aspect-[9/16] w-full max-w-[420px] overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          src={reel.video_url}
          poster={reel.thumbnail_url ?? undefined}
          autoPlay
          muted={muted}
          playsInline
          loop
          controls
          preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={liked ? "default" : "outline"} className="min-h-[44px]" onClick={toggleLike}>
          <Heart className={cn("h-4 w-4", liked && "fill-current")} aria-hidden="true" />
          {likeCount}
        </Button>
        <Button variant="outline" className="min-h-[44px]" onClick={share}>
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {shareCount}
        </Button>
        <Button variant={saved ? "default" : "outline"} className="min-h-[44px]" onClick={toggleSave}>
          Save
        </Button>
        <Button
          variant="outline"
          className="min-h-[44px]"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
        </Button>
        <Button
          variant="outline"
          className="min-h-[44px]"
          onClick={() => {
            const el = videoRef.current;
            if (!el) return;
            if (el.paused) void el.play();
            else el.pause();
          }}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
        </Button>
        {currentUserId && (
          <Button variant="ghost" className="min-h-[44px]" onClick={report}>
            <Flag className="h-4 w-4" aria-hidden="true" /> Report
          </Button>
        )}
        {(isOwner || canModerate) && (
          <Button variant="ghost" className="min-h-[44px] text-destructive" onClick={remove}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Avatar className="h-9 w-9">
              <AvatarImage src={reel.creator?.avatar_url || ""} alt="" />
              <AvatarFallback name={reel.creator?.display_name || reel.creator?.username} />
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {reel.creator?.display_name || reel.creator?.username}
              </p>
              <p className="text-xs text-muted-foreground">
                @{reel.creator?.username} · {formatRelativeTime(reel.created_at)}
              </p>
            </div>
          </div>
          <h1 className="mt-3 text-lg font-bold tracking-tight">{reel.title}</h1>
          {reel.caption && <p className="mt-1 whitespace-pre-wrap text-sm">{reel.caption}</p>}
          {reel.hashtags.length > 0 && (
            <p className="mt-2 text-sm text-primary">{reel.hashtags.map((h) => `#${h}`).join(" ")}</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {reel.view_count.toLocaleString()} views
            {reel.category ? ` · ${reel.category}` : ""}
            {reel.aspect_ratio ? ` · ${reel.aspect_ratio}` : ""}
          </p>
          {reel.moderation_status !== "approved" && (
            <p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
              Moderation status: {reel.moderation_status}
              {reel.moderation_reason ? ` — ${reel.moderation_reason}` : ""}. This reel is not in the
              public feed.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
