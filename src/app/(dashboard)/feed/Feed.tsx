"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { postCreateSchema, type PostCreateInput } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PostCardSkeleton } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/Sheet";
import { formatRelativeTime } from "@/lib/utils";
import { RichText } from "@/components/shared/RichText";
import { Heart, MessageCircle, Bookmark, Share2, Trash2, ImagePlus, Film, X, Flag, Sparkles, Users, Expand } from "lucide-react";
import { cn } from "@/lib/utils";

import type { PostWithRelations, PostMedia } from "@/types";

interface FeedClientProps {
  initialPosts: PostWithRelations[];
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

type FeedTab = "for-you" | "following" | "communities";

interface CommunityFeedPost {
  id: string;
  community_id: string;
  author_id: string;
  content: string | null;
  is_pinned: boolean;
  created_at: string;
  author: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
  community: { id: string; name: string; slug: string } | null;
}

const MAX_ATTACHMENTS = 4;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Append a page without duplicating rows (cursor pagination is timestamp-based). */
function appendUnique<T extends { id: string }>(prev: T[], next: T[]): T[] {
  if (next.length === 0) return prev;
  const seen = new Set(prev.map((p) => p.id));
  const fresh = next.filter((p) => !seen.has(p.id));
  return fresh.length > 0 ? [...prev, ...fresh] : prev;
}

export function FeedClient({ initialPosts, profile }: FeedClientProps) {
  const [tab, setTab] = useState<FeedTab>("for-you");
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState<string | null>(
    initialPosts[initialPosts.length - 1]?.created_at ?? null
  );
  const [hasMore, setHasMore] = useState(initialPosts.length === 20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [communityPosts, setCommunityPosts] = useState<CommunityFeedPost[]>([]);
  const [communityCursor, setCommunityCursor] = useState<string | null>(null);
  const [communityHasMore, setCommunityHasMore] = useState(false);

  const fetchCommunityFeed = useCallback(async (cursorValue: string | null) => {
    const params = new URLSearchParams({ limit: "20" });
    if (cursorValue) params.set("cursor", cursorValue);
    const res = await fetch(`/api/community-posts/feed?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load community discussions");
    return (data.posts ?? []) as CommunityFeedPost[];
  }, []);

  const fetchTab = useCallback(async (t: FeedTab) => {
    setIsSwitching(true);
    setLoadError(null);
    try {
      if (t === "communities") {
        const list = await fetchCommunityFeed(null);
        setCommunityPosts(list);
        setCommunityCursor(list[list.length - 1]?.created_at ?? null);
        setCommunityHasMore(list.length === 20);
        return;
      }
      const params = new URLSearchParams({ limit: "20" });
      if (t === "following") params.set("filter", "following");
      const res = await fetch(`/api/posts?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load posts");
      const list: PostWithRelations[] = data.posts ?? [];
      setPosts(list);
      setCursor(list[list.length - 1]?.created_at ?? null);
      setHasMore(list.length === 20);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load posts");
    } finally {
      setIsSwitching(false);
    }
  }, [fetchCommunityFeed]);

  const switchTab = (t: FeedTab) => {
    setTab(t);
    void fetchTab(t);
  };

  const loadMore = useCallback(async () => {
    if (tab === "communities") {
      if (!communityHasMore || isLoadingMore || !communityCursor) return;
      setIsLoadingMore(true);
      setLoadError(null);
      try {
        const more = await fetchCommunityFeed(communityCursor);
        // Dedupe by id: a createdAt-only cursor can repeat a row when two posts
        // share a timestamp, which previously duplicated cards in the feed.
        setCommunityPosts((prev) => appendUnique(prev, more));
        setCommunityCursor(more[more.length - 1]?.created_at ?? null);
        setCommunityHasMore(more.length === 20);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load posts");
      } finally {
        setIsLoadingMore(false);
      }
      return;
    }
    if (!hasMore || isLoadingMore || !cursor) return;
    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ limit: "20", cursor });
      if (tab === "following") params.set("filter", "following");
      const res = await fetch(`/api/posts?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load posts");
      const newPosts: PostWithRelations[] = data.posts ?? [];
      setPosts((prev) => appendUnique(prev, newPosts));
      setCursor(newPosts[newPosts.length - 1]?.created_at ?? null);
      setHasMore(newPosts.length === 20);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load posts");
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, hasMore, isLoadingMore, tab, communityCursor, communityHasMore, fetchCommunityFeed]);

  const handleCreated = useCallback((post: PostWithRelations) => {
    setPosts((prev) => (tab === "following" ? prev : [post, ...prev]));
  }, [tab]);

  const handleDeleted = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl px-3 pb-6 pt-4 sm:px-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Feed</h1>
          <p className="text-sm text-muted-foreground">Your campus, your community, your connection.</p>
        </div>
        <SegmentedControl<FeedTab>
          label="Feed filter"
          value={tab}
          onChange={switchTab}
          options={[
            { value: "for-you", label: "For You", icon: <Sparkles className="h-4 w-4" aria-hidden="true" /> },
            { value: "following", label: "Following", icon: <Users className="h-4 w-4" aria-hidden="true" /> },
            { value: "communities", label: "Communities", icon: <Users className="h-4 w-4" aria-hidden="true" /> },
          ]}
        />
      </div>

      {profile && tab !== "communities" && <CreatePostForm profile={profile} onCreated={handleCreated} />}

      {tab === "communities" ? (
        <div className="mt-4 space-y-3" role="feed" aria-label="Community discussions" aria-busy={isSwitching}>
          {isSwitching ? (
            <><PostCardSkeleton /><PostCardSkeleton /></>
          ) : (
            communityPosts.map((post) => (
              <CommunityFeedCard key={post.id} post={post} />
            ))
          )}
          {!isSwitching && communityPosts.length === 0 && !loadError && (
            <div className="dyne-card">
              <EmptyState
                icon={Users}
                title="No community discussions yet"
                description="Join communities to see their latest discussions here, newest first."
              />
            </div>
          )}
        </div>
      ) : (
      <div className="mt-4 space-y-3" role="feed" aria-label="Campus feed" aria-busy={isSwitching}>
        {isSwitching ? (
          <><PostCardSkeleton /><PostCardSkeleton /></>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={post} currentUserId={profile?.id ?? null} onDeleted={handleDeleted} />
          ))
        )}
        {!isSwitching && posts.length === 0 && !loadError && (
          <div className="dyne-card">
            <EmptyState
              icon={tab === "following" ? Users : Sparkles}
              title={tab === "following" ? "No posts from people you follow yet" : "No posts yet"}
              description={tab === "following"
                ? "Follow classmates and clubs to fill this space with their updates. Newest posts appear first."
                : "Be the first to share something with campus. Newest posts appear first — no hidden ranking."}
            />
          </div>
        )}
      </div>
      )}

      {loadError && (
        <div className="dyne-card mt-3">
          <ErrorState title="Couldn't load posts" description={loadError} onRetry={() => void fetchTab(tab)} />
        </div>
      )}
      {tab === "communities"
        ? (communityHasMore && communityPosts.length > 0 && !isSwitching && (
          <Button variant="outline" className="mt-3 min-h-[48px] w-full" onClick={loadMore} disabled={isLoadingMore}>
            {isLoadingMore ? "Loading…" : "Load more"}
          </Button>
        ))
        : (hasMore && posts.length > 0 && !isSwitching && (
          <Button variant="outline" className="mt-3 min-h-[48px] w-full" onClick={loadMore} disabled={isLoadingMore}>
            {isLoadingMore ? "Loading…" : "Load more"}
          </Button>
        ))}
    </div>
  );
}

function CommunityFeedCard({ post }: { post: CommunityFeedPost }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={post.author?.avatar_url || ""} alt="" />
            <AvatarFallback name={post.author?.display_name || post.author?.username} />
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{post.author?.display_name || post.author?.username}</span>
              <span className="text-sm text-muted-foreground">@{post.author?.username}</span>
              <span className="text-sm text-muted-foreground">·</span>
              <time className="text-sm text-muted-foreground">{formatRelativeTime(post.created_at)}</time>
              {post.is_pinned && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Pinned</span>
              )}
            </div>
            {post.community && (
              <a href={`/communities/${post.community.slug}`} className="mt-0.5 inline-block text-xs font-medium text-primary hover:underline">
                in {post.community.name}
              </a>
            )}
            {post.content && <RichText text={post.content} className="mt-1 whitespace-pre-wrap" />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreatePostForm({ profile, onCreated }: {
  profile: NonNullable<FeedClientProps["profile"]>;
  onCreated: (post: PostWithRelations) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [staged, setStaged] = useState<Array<{ id: string; url: string; media_type: "image" | "video" | "file" }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, control } = useForm<PostCreateInput>({
    resolver: zodResolver(postCreateSchema),
  });
  // useWatch (a hook) instead of watch() (an unmemoizable API): same value for
  // the character counter, and it satisfies the React Compiler.
  const content = useWatch({ control, name: "content" });

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    setFormError(null);
    const remaining = MAX_ATTACHMENTS - staged.length;
    const selected = Array.from(files).slice(0, remaining);
    if (selected.length === 0) {
      setFormError(`Maximum ${MAX_ATTACHMENTS} attachments per post`);
      return;
    }
    setIsUploading(true);
    try {
      for (const file of selected) {
        if (file.size > MAX_FILE_SIZE) {
          setFormError(`"${file.name}" exceeds 50MB`);
          continue;
        }
        const formData = new FormData();
        formData.append("file", file);
        formData.append("bucket", "post-media");
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error || `Failed to upload ${file.name}`);
          continue;
        }
        setStaged((prev) => [...prev, {
          id: data.media.id,
          url: data.media.url,
          media_type: data.media.media_type,
        }]);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeStaged = async (id: string) => {
    setStaged((prev) => prev.filter((m) => m.id !== id));
    await fetch(`/api/upload?mediaId=${id}&bucket=post-media`, { method: "DELETE" }).catch(() => {});
  };

  const onSubmit = async (data: PostCreateInput) => {
    if (!data.content?.trim() && staged.length === 0) {
      setFormError("Write something or attach media first");
      return;
    }
    setIsCreating(true);
    setFormError(null);
    try {
      const formData = new FormData();
      formData.append("content", data.content || "");
      staged.forEach((m) => formData.append("mediaIds", m.id));
      const res = await fetch("/api/posts", { method: "POST", body: formData });
      const result = await res.json();
      if (!res.ok) {
        const err = typeof result.error === "string" ? result.error : "Failed to create post";
        setFormError(err);
        return;
      }
      onCreated({ ...result.post, reaction_count: 0, comment_count: 0 });
      setStaged([]);
      reset();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Card className="dyne-card">
      <CardContent className="pt-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="flex gap-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={profile.avatar_url || ""} alt="" />
              <AvatarFallback name={profile.display_name || profile.username} />
            </Avatar>
            <div className="min-w-0 flex-1 space-y-2">
              <label htmlFor="post-content" className="sr-only">Share something with campus</label>
              <Textarea
                id="post-content"
                placeholder="Share something with campus…"
                {...register("content")}
                className="min-h-[80px] resize-none rounded-xl"
                disabled={isCreating}
                maxLength={5000}
              />
              {staged.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {staged.map((m) => (
                    <div key={m.id} className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                      {m.media_type === "video" ? (
                        <video src={m.url} className="h-full w-full object-cover" muted playsInline />
                      ) : m.media_type === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt="Attachment preview" className="h-full w-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt="Attached file preview" className="h-full w-full bg-muted object-contain p-2 text-xs" />
                      )}
                      <button
                        type="button"
                        onClick={() => removeStaged(m.id)}
                        aria-label="Remove attachment"
                        className="absolute right-1 top-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/60 text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                    aria-label="Attach photos or videos"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    disabled={isUploading || staged.length >= MAX_ATTACHMENTS}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="mr-1 h-5 w-5" aria-hidden="true" />
                    Photo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    disabled={isUploading || staged.length >= MAX_ATTACHMENTS}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Film className="mr-1 h-5 w-5" aria-hidden="true" />
                    Video
                  </Button>
                </div>
                <Button type="submit" disabled={isCreating || isUploading} className="min-h-[44px] rounded-xl px-6">
                  {isUploading ? "Uploading…" : isCreating ? "Posting…" : "Post"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {(content?.length ?? 0)}/5000 · {staged.length}/{MAX_ATTACHMENTS} attachments
              </p>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function PostCard({ post, currentUserId, onDeleted }: {
  post: PostWithRelations;
  currentUserId: string | null;
  onDeleted: (id: string) => void;
}) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.reaction_count || 0);
  const [saved, setSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count || 0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // In-flight guards: rapid taps must not stack overlapping writes or revert
  // onto a stale snapshot (double-tap liked a post, server 400'd, UI flipped back).
  const likePending = useRef(false);
  const savePending = useRef(false);
  const [viewer, setViewer] = useState<{ url: string; type: "image" | "video" | "file" } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const isOwner = currentUserId === post.author_id;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, s] = await Promise.all([
          fetch(`/api/reactions?targetType=post&targetId=${post.id}`).then((res) => (res.ok ? res.json() : null)),
          currentUserId
            ? fetch(`/api/saved-posts/check?postId=${post.id}`).then((res) => (res.ok ? res.json() : null)).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (!cancelled) {
          if (r) {
            setLiked(!!r.userReaction);
            const total = Object.values((r.counts ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
            if (total > 0) setLikeCount(total);
          }
          if (s) setSaved(!!s.saved);
        }
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [post.id, currentUserId]);

  const toggleLike = async () => {
    if (!currentUserId || likePending.current) return;
    likePending.current = true;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => Math.max(0, c + (wasLiked ? -1 : 1)));
    setActionError(null);
    try {
      const res = wasLiked
        ? await fetch(`/api/reactions?targetType=post&targetId=${post.id}&reactionType=like`, { method: "DELETE" })
        : await fetch("/api/reactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetType: "post", targetId: post.id, reactionType: "like" }),
          });
      if (!res.ok) {
        setLiked(wasLiked);
        setLikeCount((c) => Math.max(0, c + (wasLiked ? 1 : -1)));
        setActionError(
          res.status === 400
            ? "Reaction already saved — try again"
            : "Could not update reaction"
        );
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount((c) => Math.max(0, c + (wasLiked ? 1 : -1)));
      setActionError("Network error");
    } finally {
      likePending.current = false;
    }
  };

  const toggleSave = async () => {
    if (!currentUserId || savePending.current) return;
    savePending.current = true;
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      const res = wasSaved
        ? await fetch(`/api/saved-posts?postId=${post.id}`, { method: "DELETE" })
        : await fetch("/api/saved-posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ postId: post.id }),
          });
      if (!res.ok) setSaved(wasSaved);
    } catch {
      setSaved(wasSaved);
    } finally {
      savePending.current = false;
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/feed?post=${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Dyne post", text: post.content ?? "Check out this post on Dyne", url });
      } else {
        await navigator.clipboard.writeText(url);
        setActionError("Link copied to clipboard");
      }
    } catch { /* user cancelled */ }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this post?")) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/posts?id=${post.id}`, { method: "DELETE" });
      if (!res.ok) {
        setActionError("Could not delete post");
        return;
      }
      onDeleted(post.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const submitReport = async (reason: string, details?: string) => {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "post",
        targetId: post.id,
        reason,
        ...(details?.trim() ? { description: details.trim().slice(0, 2000) } : {}),
      }),
    });
    setReportOpen(false);
    setActionError(
      res.ok ? "Thanks — our moderators will review this post" : "Could not submit the report. Please try again."
    );
  };

  return (
    <Card className="dyne-card dyne-fade-in">
      <CardContent className="pt-4">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={post.author?.avatar_url || ""} alt="" />
            <AvatarFallback name={post.author?.display_name || post.author?.username} />
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="truncate font-semibold">{post.author?.display_name || post.author?.username}</span>
              <span className="truncate text-sm text-muted-foreground">@{post.author?.username}</span>
              <span className="text-sm text-muted-foreground" aria-hidden="true">·</span>
              <time className="text-sm text-muted-foreground">{formatRelativeTime(post.created_at)}</time>
              <span className="ml-auto flex gap-1">
                {!isOwner && currentUserId && (
                  <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" onClick={() => setReportOpen(true)} aria-label="Report post">
                    <Flag className="h-4 w-4" />
                  </Button>
                )}
                {isOwner && (
                  <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] text-destructive" onClick={handleDelete} disabled={isDeleting} aria-label="Delete post">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </span>
            </div>
            {post.content && <RichText text={post.content} className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed" />}
            {post.media && post.media.length > 0 && (
              <div className={cn("mt-2.5 grid gap-2", post.media.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                {post.media.map((m: PostMedia) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setViewer({ url: m.url, type: m.media_type })}
                    className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-muted"
                    aria-label={`Open ${m.media_type} fullscreen`}
                  >
                    {m.media_type === "video" ? (
                      <video src={m.url} preload="metadata" muted playsInline className="absolute inset-0 h-full w-full object-cover" />
                    ) : m.media_type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt="Post attachment" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt="Attached file" className="absolute inset-0 h-full w-full bg-muted object-contain p-2 text-xs text-muted-foreground" loading="lazy" />
                    )}
                    <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <Expand className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </button>
                ))}
              </div>
            )}
            {actionError && <p role="status" className="mt-2 text-xs text-muted-foreground">{actionError}</p>}
            <div className="mt-3 flex items-center gap-1 border-t border-border pt-2">
              <Button
                variant="ghost"
                size="sm"
                className={cn("min-h-[44px] gap-1.5 rounded-xl", liked && "text-red-500")}
                onClick={toggleLike}
                aria-pressed={liked}
                aria-label={liked ? "Unlike post" : "Like post"}
              >
                <Heart className={cn("h-[18px] w-[18px]", liked && "fill-current")} aria-hidden="true" />
                <span className="text-sm">{likeCount}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px] gap-1.5 rounded-xl"
                onClick={() => setShowComments((v) => !v)}
                aria-expanded={showComments}
                aria-label={showComments ? "Hide comments" : "Show comments"}
              >
                <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />
                <span className="text-sm">{commentCount}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn("min-h-[44px] gap-1.5 rounded-xl", saved && "text-primary")}
                onClick={toggleSave}
                aria-pressed={saved}
                aria-label={saved ? "Unsave post" : "Save post"}
              >
                <Bookmark className={cn("h-[18px] w-[18px]", saved && "fill-current")} aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="sm" className="ml-auto min-h-[44px] gap-1.5 rounded-xl" onClick={handleShare} aria-label="Share post">
                <Share2 className="h-[18px] w-[18px]" aria-hidden="true" />
              </Button>
            </div>
            {showComments && (
              <CommentsSection
                postId={post.id}
                currentUserId={currentUserId}
                onCountChange={setCommentCount}
              />
            )}
          </div>
        </div>
      </CardContent>
      {viewer && (
        <MediaViewer url={viewer.url} type={viewer.type} onClose={() => setViewer(null)} />
      )}
      <BottomSheet open={reportOpen} onClose={() => setReportOpen(false)} title="Report post">
        <ReportForm onSubmit={submitReport} onCancel={() => setReportOpen(false)} />
      </BottomSheet>
    </Card>
  );
}

export function MediaViewer({ url, type, onClose }: { url: string; type: "image" | "video" | "file"; onClose: () => void }) {
  // Shared dialog contract: Escape closes, scroll locks, focus trapped/restored.
  const viewerRef = useRef<HTMLDivElement>(null);
  useDialogA11y(true, onClose, viewerRef);
  return (
    <div
      ref={viewerRef}
      tabIndex={-1}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      onClick={onClose}
    >
      <button type="button" onClick={onClose} aria-label="Close viewer" className="absolute right-4 top-4 flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-white/10 text-white">
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="max-h-[90svh] max-w-4xl overflow-hidden rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {type === "video" ? (
          <video src={url} controls autoPlay className="max-h-[90svh] w-auto" />
        ) : type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Post media fullscreen" className="max-h-[90svh] w-auto object-contain" />
        ) : (
          // Documents are opened, not previewed as images.
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[48px] items-center rounded-xl border border-white/20 bg-white/10 px-6 text-sm font-medium text-white"
          >
            Open attachment
          </a>
        )}
      </div>
    </div>
  );
}

function ReportForm({ onSubmit, onCancel }: { onSubmit: (reason: string, details?: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason) onSubmit(reason, details);
      }}
    >
      <div className="space-y-2">
        <label htmlFor="report-reason" className="text-sm font-medium">Why are you reporting this?</label>
        <select
          id="report-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm"
        >
          <option value="spam">Spam</option>
          <option value="harassment">Harassment</option>
          <option value="bullying">Bullying</option>
          <option value="hate">Hate speech</option>
          <option value="sexual_content">Sexual content</option>
          <option value="violence">Violence</option>
          <option value="self_harm">Self-harm</option>
          <option value="impersonation">Impersonation</option>
          <option value="privacy">Privacy violation</option>
          <option value="copyright">Copyright</option>
          <option value="misinformation">Misinformation</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="report-details" className="text-sm font-medium">Details (optional)</label>
        <Textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} placeholder="Add context for moderators…" rows={3} />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="flex-1">Submit report</Button>
      </div>
    </form>
  );
}

interface CommentItem {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  reply_count?: number;
  author: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
}

function CommentsSection({ postId, currentUserId, onCountChange }: {
  postId: string;
  currentUserId: string | null;
  onCountChange: (n: number) => void;
}) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/comments?postId=${postId}&limit=20`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load comments");
        if (!cancelled) {
          setComments(data.comments ?? []);
          onCountChange((data.comments ?? []).length);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load comments");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !currentUserId) return;
    setIsPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, content: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Failed to post comment");
      // Derive the new list first, then report the count from that same snapshot
      // (the previous `comments.length + 1` read a stale closure and drifted).
      const next = [...comments, data.comment];
      setComments(next);
      onCountChange(next.length);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {isLoading && <p className="text-sm text-muted-foreground">Loading comments…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!isLoading && comments.length === 0 && (
        <p className="text-sm text-muted-foreground">No comments yet. Start the conversation!</p>
      )}
      <ul className="space-y-2">
        {comments.map((c) => (
          <CommentRow
            key={c.id}
            postId={postId}
            comment={c}
            currentUserId={currentUserId}
            onDeleted={() => {
              const next = comments.filter((x) => x.id !== c.id);
              setComments(next);
              onCountChange(Math.max(0, next.length));
            }}
            onReplyAdded={() => {
              setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, reply_count: (x.reply_count ?? 0) + 1 } : x)));
            }}
          />
        ))}
      </ul>
      {currentUserId && (
        <form onSubmit={submitComment} className="flex gap-2">
          <label htmlFor={`comment-${postId}`} className="sr-only">Write a comment</label>
          <input
            id={`comment-${postId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a comment…"
            maxLength={2000}
            disabled={isPosting}
            className="min-h-[44px] flex-1 rounded-xl border border-input bg-background px-3 text-sm"
          />
          <Button type="submit" size="sm" className="min-h-[44px] rounded-xl" disabled={isPosting || !draft.trim()}>
            {isPosting ? "…" : "Reply"}
          </Button>
        </form>
      )}
    </div>
  );
}

/** One top-level comment with an expandable single-level reply thread. */
function CommentRow({ postId, comment, currentUserId, onDeleted, onReplyAdded }: {
  postId: string;
  comment: CommentItem;
  currentUserId: string | null;
  onDeleted: () => void;
  onReplyAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<CommentItem[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (replies.length > 0) return;
    setLoadingReplies(true);
    setReplyError(null);
    try {
      const res = await fetch(`/api/comments?postId=${postId}&parentId=${comment.id}&limit=20`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load replies");
      setReplies(data.comments ?? []);
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : "Failed to load replies");
    } finally {
      setLoadingReplies(false);
    }
  };

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !currentUserId || posting) return;
    setPosting(true);
    setReplyError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, content: draft.trim(), parentCommentId: comment.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Failed to post reply");
      setReplies((prev) => [...prev, data.comment]);
      setDraft("");
      onReplyAdded();
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Failed to post reply");
    } finally {
      setPosting(false);
    }
  };

  const remove = async () => {
    setDeleted(true);
    try {
      const res = await fetch(`/api/comments?id=${comment.id}`, { method: "DELETE" });
      if (!res.ok) setDeleted(false);
      else onDeleted();
    } catch {
      setDeleted(false);
    }
  };

  const removeReply = async (id: string) => {
    const prev = replies;
    setReplies((r) => r.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/comments?id=${id}`, { method: "DELETE" });
      if (!res.ok) setReplies(prev);
    } catch {
      setReplies(prev);
    }
  };

  if (deleted) return null;
  const count = comment.reply_count ?? replies.length;

  return (
    <li className="flex gap-2">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={comment.author?.avatar_url || ""} alt="" />
        <AvatarFallback name={comment.author?.display_name || comment.author?.username} />
      </Avatar>
      <div className="min-w-0 flex-1 rounded-xl bg-muted/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{comment.author?.display_name || comment.author?.username}</span>
          <time className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(comment.created_at)}</time>
          {comment.author_id === currentUserId && (
            <button
              onClick={remove}
              className="ml-auto min-h-[44px] shrink-0 px-3 text-xs text-muted-foreground hover:text-destructive"
              aria-label="Delete comment"
            >
              Delete
            </button>
          )}
        </div>
        <RichText text={comment.content} className="whitespace-pre-wrap break-words text-sm" />
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={toggle}
            aria-expanded={open}
            className="min-h-[44px] rounded-lg px-2 text-xs font-medium text-primary hover:underline"
          >
            {open ? "Hide replies" : count > 0 ? `Replies (${count})` : "Reply"}
          </button>
        </div>
        {open && (
          <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
            {loadingReplies && <p className="text-xs text-muted-foreground">Loading replies…</p>}
            {replyError && <p role="alert" className="text-xs text-destructive">{replyError}</p>}
            {replies.map((r) => (
              <div key={r.id} className="flex gap-2">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarImage src={r.author?.avatar_url || ""} alt="" />
                  <AvatarFallback name={r.author?.display_name || r.author?.username} />
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium">{r.author?.display_name || r.author?.username}</span>
                    <time className="shrink-0 text-[11px] text-muted-foreground">{formatRelativeTime(r.created_at)}</time>
                    {r.author_id === currentUserId && (
                      <button
                        onClick={() => removeReply(r.id)}
                        className="ml-auto min-h-[28px] shrink-0 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                        aria-label="Delete reply"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <RichText text={r.content} className="whitespace-pre-wrap break-words text-[13px]" />
                </div>
              </div>
            ))}
            {currentUserId ? (
              <form onSubmit={submitReply} className="flex gap-2">
                <label htmlFor={`reply-${comment.id}`} className="sr-only">Write a reply</label>
                <input
                  id={`reply-${comment.id}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a reply…"
                  maxLength={2000}
                  disabled={posting}
                  className="min-h-[44px] flex-1 rounded-lg border border-input bg-background px-2.5 text-[13px]"
                />
                <Button type="submit" size="sm" className="min-h-[44px] rounded-lg" disabled={posting || !draft.trim()}>
                  {posting ? "…" : "Reply"}
                </Button>
              </form>
            ) : (
              !loadingReplies && replies.length === 0 && !replyError && (
                <p className="text-xs text-muted-foreground">No replies yet.</p>
              )
            )}
          </div>
        )}
      </div>
    </li>
  );
}
