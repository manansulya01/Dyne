"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Heart,
  Share2,
  Bookmark,
  Flag,
  Volume2,
  VolumeX,
  Pause,
  Play,
  ChevronUp,
  ChevronDown,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { cn, formatRelativeTime } from "@/lib/utils";

/**
 * Reels vertical feed.
 *
 * Interaction model:
 *   - touch: swipe up/down between reels (with a threshold so a scroll nudge
 *     does not skip);
 *   - desktop: wheel (throttled), ArrowUp/ArrowDown, PageUp/PageDown, and
 *     explicit buttons — the page is fully usable without gestures;
 *   - keyboard shortcuts are documented via a live region and aria-labels.
 *
 * Media policy: only the active reel plus a small window of neighbours are
 * mounted, each with `preload="metadata"`, and only the active one plays.
 */

interface ReelItem {
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
  moderation_status: string;
  created_at: string;
  liked_by_viewer: boolean;
}

/** Neighbours kept mounted either side of the active index. */
const WINDOW = 1;
/** Minimum swipe distance (px) before the feed changes reels. */
const SWIPE_THRESHOLD = 48;
/** Wheel events within this window are ignored (wheel "inertia" guard). */
const WHEEL_COOLDOWN_MS = 320;

export function ReelsFeed({
  initialReels,
  initialCursor,
  initialHasMore,
  categories,
  currentUserId,
  canUpload,
}: {
  initialReels: ReelItem[];
  initialCursor: { before: string; beforeId: string } | null;
  initialHasMore: boolean;
  categories: string[];
  currentUserId: string | null;
  canUpload: boolean;
}) {
  const router = useRouter();
  const [reels, setReels] = useState<ReelItem[]>(initialReels);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [index, setIndex] = useState(0);
  const [category, setCategory] = useState("all");
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const wheelLock = useRef(0);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: "8" });
      params.set("before", cursor.before);
      params.set("beforeId", cursor.beforeId);
      if (category !== "all") params.set("category", category);
      const res = await fetch(`/api/reels?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      const list = (data.reels ?? []) as ReelItem[];
      setReels((prev) => {
        // Guard against duplicates: keyset pagination can repeat a row when a
        // reel is published mid-scroll.
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...list.filter((r) => !seen.has(r.id))];
      });
      setCursor(data.cursor ?? null);
      setHasMore(Boolean(data.hasMore));
    } catch {
      setNotice("Could not load more reels.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, category]);

  const go = useCallback(
    (next: number) => {
      setIndex((current) => {
        const clamped = Math.max(0, Math.min(next, reels.length - 1));
        if (clamped > current && current >= reels.length - 1 - WINDOW && hasMore) {
          void loadMore();
        }
        return clamped;
      });
    },
    [reels.length, hasMore, loadMore]
  );

  // Wheel navigation (desktop). Cooldown prevents one gesture skipping several.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 12) return;
      const now = Date.now();
      if (now - wheelLock.current < WHEEL_COOLDOWN_MS) return;
      wheelLock.current = now;
      go(index + (e.deltaY > 0 ? 1 : -1));
    };
    node.addEventListener("wheel", onWheel, { passive: true });
    return () => node.removeEventListener("wheel", onWheel);
  }, [go, index]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        go(0);
      } else if (e.key === "End") {
        e.preventDefault();
        go(reels.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, reels.length]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dy = t.clientY - start.y;
    const dx = t.clientX - start.x;
    // Vertical intent only: a horizontal drag belongs to the page, not the feed.
    if (Math.abs(dy) < SWIPE_THRESHOLD || Math.abs(dy) < Math.abs(dx)) return;
    go(index + (dy < 0 ? 1 : -1));
  };

  if (reels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <h2 className="text-lg font-semibold">No reels yet</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {category === "all"
            ? "Campus reels will appear here once they are published."
            : "No reels in this category yet."}
        </p>
        {canUpload && (
          <Button asChild className="mt-5 min-h-[44px]">
            <Link href="/reels/upload">
              <Upload className="h-4 w-4" aria-hidden="true" /> Upload a reel
            </Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Reels</h1>
          <p className="text-sm text-muted-foreground">
            Short vertical campus videos. Swipe, scroll, or use ↑ ↓ to browse.
          </p>
        </div>
        {canUpload && (
          <Button asChild size="sm" className="min-h-[44px]">
            <Link href="/reels/upload">
              <Upload className="h-4 w-4" aria-hidden="true" /> Upload
            </Link>
          </Button>
        )}
      </div>

      {categories.length > 0 && (
        <div
          className="dyne-scroll mb-3 flex gap-1.5 overflow-x-auto pb-1"
          role="group"
          aria-label="Reel categories"
        >
          {["all", ...categories].map((c) => (
            <button
              key={c}
              onClick={() => {
                setCategory(c);
                setIndex(0);
              }}
              aria-pressed={category === c}
              className={cn(
                "min-h-[44px] shrink-0 rounded-full px-4 text-sm font-medium",
                category === c
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground"
              )}
            >
              {c === "all" ? "All" : c}
            </button>
          ))}
        </div>
      )}

      {notice && (
        <p role="status" className="mb-2 rounded-xl border border-border bg-muted/50 p-3 text-sm">
          {notice}
        </p>
      )}

      <div
        ref={containerRef}
        className="relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="relative mx-auto aspect-[9/16] w-full max-w-[420px] overflow-hidden rounded-2xl bg-black"
          role="region"
          aria-roledescription="carousel"
          aria-label={`Reel ${index + 1} of ${reels.length}`}
        >
          {reels.map((reel, i) => {
            // Only the active reel and its immediate neighbours are mounted.
            if (Math.abs(i - index) > WINDOW) return null;
            const active = i === index;
            return (
              <div
                key={reel.id}
                className={cn(
                  "absolute inset-0 transition-opacity duration-200",
                  active ? "opacity-100" : "pointer-events-none opacity-0"
                )}
                aria-hidden={!active}
              >
                <ReelStage
                  reel={reel}
                  active={active}
                  currentUserId={currentUserId}
                  onOpen={() => router.push(`/reels/${reel.id}`)}
                />
              </div>
            );
          })}
        </div>

        {/* Desktop navigation controls (gestures are never the only way) */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-2 pr-1 sm:-mr-2">
          <button
            onClick={() => go(index - 1)}
            disabled={index === 0}
            aria-label="Previous reel"
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow disabled:opacity-40"
          >
            <ChevronUp className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            onClick={() => go(index + 1)}
            disabled={index >= reels.length - 1 && !hasMore}
            aria-label="Next reel"
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow disabled:opacity-40"
          >
            <ChevronDown className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground" aria-live="polite">
        {index + 1} of {reels.length}
        {hasMore ? " · scroll for more" : ""}
      </p>

      {loadingMore && (
        <p className="mt-2 text-center text-sm text-muted-foreground" role="status">
          Loading more reels…
        </p>
      )}

      {!hasMore && reels.length > 0 && (
        <div className="mt-4 text-center">
          <Button variant="outline" className="min-h-[44px]" onClick={() => void loadMore()} disabled={loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function ReelStage({
  reel,
  active,
  currentUserId,
  onOpen,
}: {
  reel: ReelItem;
  active: boolean;
  currentUserId: string | null;
  onOpen: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState(reel.liked_by_viewer);
  const [likeCount, setLikeCount] = useState(reel.like_count);
  const [saved, setSaved] = useState(false);
  const [shareCount, setShareCount] = useState(reel.share_count);

  // Autoplay is attempted only for the active reel and is expected to be
  // refused by browser autoplay policy; the poster/paused state handles it.
  // The play state is derived from the element's own events rather than set
  // synchronously here, which keeps the effect free of cascading renders.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    if (!active) {
      el.pause();
      return;
    }
    void el.play().catch(() => {
      /* Autoplay refused by policy: the poster stays visible. */
    });
    return () => {
      el.pause();
    };
  }, [active, muted]);

  const toggleLike = async () => {
    if (!currentUserId) return;
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
        // Trust the server's authoritative count (race-safe).
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
    const url = `${window.location.origin}/reels/${reel.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: reel.title, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      const res = await fetch(`/api/reels/${reel.id}/share`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setShareCount(data.share_count);
      }
    } catch {
      /* user cancelled the share sheet */
    }
  };

  const report = async () => {
    const reason = window.prompt("Why are you reporting this reel? (spam, harassment, …)");
    if (!reason) return;
    await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "reel", targetId: reel.id, reason: reason.slice(0, 100) }),
    });
  };

  const toggleSave = async () => {
    if (!currentUserId) return;
    const next = !saved;
    setSaved(next);
    try {
      await fetch(`/api/reels/${reel.id}/save`, {
        method: next ? "POST" : "DELETE",
      });
    } catch {
      setSaved(!next);
    }
  };

  return (
    <>
      <video
        ref={videoRef}
        src={reel.video_url}
        poster={reel.thumbnail_url ?? undefined}
        // Only the active reel fetches bytes; neighbours get metadata only.
        preload={active ? "auto" : "metadata"}
        muted={muted}
        playsInline
        loop
        controls={false}
        className="absolute inset-0 h-full w-full object-contain"
        onClick={() => {
          const el = videoRef.current;
          if (!el) return;
          if (el.paused) {
            void el.play().then(() => setPlaying(true), () => setPlaying(false));
          } else {
            el.pause();
            setPlaying(false);
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      {/* Tap-to-pause affordance */}
      {!playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 text-white">
            <Play className="h-7 w-7" aria-hidden="true" />
          </span>
        </div>
      )}

      {/* Gradient scrim for legibility (text is always over media) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 pb-20 sm:pb-16">
        <div className="min-w-0 flex-1 text-white">
          <Link
            href={`/reels/${reel.id}`}
            onClick={(e) => {
              e.preventDefault();
              onOpen();
            }}
            className="inline-flex min-h-[44px] items-center gap-2"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={reel.creator?.avatar_url || ""} alt="" />
              <AvatarFallback name={reel.creator?.display_name || reel.creator?.username} />
            </Avatar>
            <span className="text-sm font-semibold">
              {reel.creator?.display_name || reel.creator?.username || "Unknown"}
            </span>
          </Link>
          <p className="mt-1 text-sm font-medium leading-snug">{reel.title}</p>
          {reel.caption && (
            <p className="mt-0.5 line-clamp-2 text-xs text-white/85">{reel.caption}</p>
          )}
          {reel.hashtags.length > 0 && (
            <p className="mt-1 text-xs text-white/75">
              {reel.hashtags.map((h) => `#${h}`).join(" ")}
            </p>
          )}
          <p className="mt-1 text-[11px] text-white/70">
            {reel.view_count.toLocaleString()} views · {formatRelativeTime(reel.created_at)}
            {reel.category ? ` · ${reel.category}` : ""}
          </p>
          {reel.moderation_status !== "approved" && (
            <p className="mt-1 inline-block rounded bg-amber-500/90 px-2 py-0.5 text-[11px] font-semibold text-black">
              {reel.moderation_status === "rejected" ? "Not published" : "Pending review"}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1">
          <IconAction
            label={liked ? "Unlike" : "Like"}
            onClick={toggleLike}
            active={liked}
            icon={<Heart className={cn("h-6 w-6", liked && "fill-red-500 text-red-500")} aria-hidden="true" />}
            count={likeCount}
          />
          <IconAction
            label={saved ? "Remove from saved" : "Save"}
            onClick={toggleSave}
            active={saved}
            icon={<Bookmark className={cn("h-6 w-6", saved && "fill-primary text-primary")} aria-hidden="true" />}
            count={0}
          />
          <IconAction
            label="Share"
            onClick={share}
            icon={<Share2 className="h-6 w-6" aria-hidden="true" />}
            count={shareCount}
          />
          <IconAction
            label={muted ? "Unmute" : "Mute"}
            onClick={() => setMuted((m) => !m)}
            icon={
              muted ? (
                <VolumeX className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Volume2 className="h-6 w-6" aria-hidden="true" />
              )
            }
            count={0}
          />
          <IconAction
            label={playing ? "Pause" : "Play"}
            onClick={() => {
              const el = videoRef.current;
              if (!el) return;
              if (el.paused) void el.play().then(() => setPlaying(true), () => setPlaying(false));
              else {
                el.pause();
                setPlaying(false);
              }
            }}
            icon={playing ? <Pause className="h-6 w-6" aria-hidden="true" /> : <Play className="h-6 w-6" aria-hidden="true" />}
            count={0}
          />
          <IconAction label="Report" onClick={report} icon={<Flag className="h-6 w-6" aria-hidden="true" />} count={0} />
        </div>
      </div>
    </>
  );
}

function IconAction({
  label,
  onClick,
  icon,
  count,
  active,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  count: number;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
    >
      {icon}
      {count > 0 && <span className="mt-0.5 text-[11px] font-semibold tabular-nums">{count}</span>}
    </button>
  );
}
