"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Play, Upload } from "lucide-react";

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
}

/** Landscape-first library: 16:9 grid, keyboard-reachable cards. */
export function VideosBrowse({
  initialVideos,
  initialCursor,
  initialHasMore,
  categories,
  currentUserId,
  canUpload,
}: {
  initialVideos: VideoItem[];
  initialCursor: { before: string; beforeId: string } | null;
  initialHasMore: boolean;
  categories: string[];
  currentUserId: string | null;
  canUpload: boolean;
}) {
  const [videos, setVideos] = useState<VideoItem[]>(initialVideos);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"new" | "popular">("new");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Ref mirrors the latest cursor so the "load more" handler can read it
  // without becoming a dependency of the reload effect. It is synced in an
  // effect (never during render) to keep the render pure.
  const cursorRef = useRef(initialCursor);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  const buildParams = useCallback(
    (opts: { append?: boolean } = {}) => {
      const params = new URLSearchParams({ limit: "24" });
      if (category !== "all") params.set("category", category);
      if (sort === "popular") params.set("sort", "popular");
      if (debounced) params.set("search", debounced);
      if (opts.append && cursorRef.current) {
        params.set("before", cursorRef.current.before);
        params.set("beforeId", cursorRef.current.beforeId);
      }
      return params;
    },
    [category, sort, debounced]
  );

  const fetchVideos = useCallback(
    async (opts: { append?: boolean } = {}) => {
      if (opts.append) setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/videos?${buildParams(opts).toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load videos");
        const list = (data.videos ?? []) as VideoItem[];
        setVideos((prev) => {
          if (!opts.append) return list;
          // Guard against duplicates: keyset pagination can repeat a row when a
          // video is published mid-scroll.
          const seen = new Set(prev.map((v) => v.id));
          return [...prev, ...list.filter((v) => !seen.has(v.id))];
        });
        setCursor(data.cursor ?? null);
        setHasMore(Boolean(data.hasMore));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load videos");
      } finally {
        setLoading(false);
      }
    },
    [buildParams]
  );

  // Reload (not append) whenever the scope changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filter-scoped server-state sync; refresh shared with load-more
    void fetchVideos();
  }, [fetchVideos]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Dyne Videos</h1>
          <p className="text-sm text-muted-foreground">
            Landscape lectures, events, performances and campus documentaries. Short vertical clips live
            in <Link href="/reels" className="font-medium text-primary hover:underline">Reels</Link>.
          </p>
        </div>
        {canUpload && (
          <Button asChild size="sm" className="min-h-[44px]">
            <Link href="/videos/upload">
              <Upload className="h-4 w-4" aria-hidden="true" /> Upload
            </Link>
          </Button>
        )}
      </div>

      {categories.length > 0 && (
        <div className="dyne-scroll flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Video categories">
          {["all", ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
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

      <div className="flex flex-wrap gap-2">
        <div className="min-w-52 flex-1">
          <label htmlFor="videos-search" className="sr-only">
            Search videos
          </label>
          <Input
            id="videos-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or description…"
            maxLength={100}
            className="min-h-[44px]"
          />
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Video sort">
          {(["new", "popular"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              aria-pressed={sort === s}
              className={cn(
                "min-h-[44px] rounded-xl px-4 text-sm font-medium capitalize",
                sort === s ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
              )}
            >
              {s === "new" ? "Newest" : "Most watched"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {videos.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <Play className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">
            {debounced || category !== "all" ? "No videos match" : "No videos yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {debounced || category !== "all"
              ? "Try a different search or category."
              : canUpload
                ? "Upload the first campus video."
                : "Teachers and admins can publish campus videos."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <article key={v.id} className="overflow-hidden rounded-lg border bg-card shadow-sm">
              <Link href={`/videos/${v.id}`} className="block">
                <div className="relative aspect-video bg-muted">
                  {v.thumbnail_url ? (
                    <Image
                      src={v.thumbnail_url}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <video
                      src={v.video_url}
                      preload="metadata"
                      muted
                      playsInline
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                    {v.view_count.toLocaleString()} views
                  </span>
                </div>
              </Link>
              <div className="p-3">
                <Link href={`/videos/${v.id}`} className="block min-h-[44px]">
                  <h2 className="line-clamp-2 font-medium">{v.title}</h2>
                </Link>
                <div className="mt-2 flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={v.creator?.avatar_url || ""} alt="" />
                    <AvatarFallback name={v.creator?.display_name || v.creator?.username} />
                  </Avatar>
                  <span className="truncate text-xs text-muted-foreground">
                    {v.creator?.display_name || v.creator?.username}
                  </span>
                  <time className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(v.created_at)}
                  </time>
                </div>
                {v.moderation_status !== "approved" && (
                  <p className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                    {v.moderation_status === "rejected" ? "Not published" : "Pending review"}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {hasMore && videos.length > 0 && (
        <Button
          variant="outline"
          className="min-h-[48px] w-full"
          onClick={() => void fetchVideos({ append: true })}
          disabled={loading}
        >
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
      {!hasMore && videos.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">You have reached the end.</p>
      )}
      {currentUserId === null && videos.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Sign in to like, save and comment on videos.
        </p>
      )}
    </div>
  );
}
