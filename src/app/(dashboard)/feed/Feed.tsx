"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { postCreateSchema, type PostCreateInput } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { formatRelativeTime } from "@/lib/utils";
import { Heart, MessageCircle, Bookmark, Share2, Trash2, ImagePlus, Film, X, Flag } from "lucide-react";
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

const MAX_ATTACHMENTS = 4;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export function FeedClient({ initialPosts, profile }: FeedClientProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState<string | null>(
    initialPosts[initialPosts.length - 1]?.created_at ?? null
  );
  const [hasMore, setHasMore] = useState(initialPosts.length === 20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || !cursor) return;
    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ limit: "20", cursor });
      const res = await fetch(`/api/posts?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load posts");
      const newPosts: PostWithRelations[] = data.posts ?? [];
      setPosts((prev) => [...prev, ...newPosts]);
      setCursor(newPosts[newPosts.length - 1]?.created_at ?? null);
      setHasMore(newPosts.length === 20);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load posts");
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, hasMore, isLoadingMore]);

  const handleCreated = useCallback((post: PostWithRelations) => {
    setPosts((prev) => [post, ...prev]);
  }, []);

  const handleDeleted = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto w-full">
      {profile && <CreatePostForm profile={profile} onCreated={handleCreated} />}

      <div className="space-y-4" role="feed" aria-label="Campus feed">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} currentUserId={profile?.id ?? null} onDeleted={handleDeleted} />
        ))}
        {posts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="font-medium">No posts yet</p>
            <p className="text-sm mt-1">Be the first to share something with campus!</p>
          </div>
        )}
      </div>

      {loadError && (
        <p role="alert" className="text-center text-sm text-destructive">{loadError}</p>
      )}
      {hasMore && posts.length > 0 && (
        <Button variant="outline" className="w-full min-h-[44px]" onClick={loadMore} disabled={isLoadingMore}>
          {isLoadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}

function CreatePostForm({ profile, onCreated }: {
  profile: NonNullable<FeedClientProps["profile"]>;
  onCreated: (post: PostWithRelations) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [staged, setStaged] = useState<Array<{ id: string; url: string; media_type: "image" | "video" }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, watch } = useForm<PostCreateInput>({
    resolver: zodResolver(postCreateSchema),
  });
  const content = watch("content");

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
    <Card>
      <CardContent className="pt-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="flex gap-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={profile.avatar_url || ""} alt="" />
              <AvatarFallback name={profile.display_name || profile.username} />
            </Avatar>
            <div className="flex-1 space-y-2 min-w-0">
              <label htmlFor="post-content" className="sr-only">What&apos;s on your mind?</label>
              <Textarea
                id="post-content"
                placeholder="What's on your mind?"
                {...register("content")}
                className="min-h-[80px] resize-none"
                disabled={isCreating}
                maxLength={5000}
              />
              {staged.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {staged.map((m) => (
                    <div key={m.id} className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                      {m.media_type === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt="Attachment preview" className="h-full w-full object-cover" />
                      ) : (
                        <video src={m.url} className="h-full w-full object-cover" muted playsInline />
                      )}
                      <button
                        type="button"
                        onClick={() => removeStaged(m.id)}
                        aria-label="Remove attachment"
                        className="absolute top-1 right-1 min-h-[32px] min-w-[32px] flex items-center justify-center rounded-full bg-black/60 text-white"
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
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    disabled={isUploading || staged.length >= MAX_ATTACHMENTS}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="h-5 w-5 mr-1" aria-hidden="true" />
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
                    <Film className="h-5 w-5 mr-1" aria-hidden="true" />
                    Video
                  </Button>
                </div>
                <Button type="submit" disabled={isCreating || isUploading} className="min-h-[44px]">
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

function PostCard({ post, currentUserId, onDeleted }: {
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
    if (!currentUserId) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => c + (wasLiked ? -1 : 1));
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
        setLikeCount((c) => c + (wasLiked ? 1 : -1));
        setActionError("Could not update reaction");
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount((c) => c + (wasLiked ? 1 : -1));
      setActionError("Network error");
    }
  };

  const toggleSave = async () => {
    if (!currentUserId) return;
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

  const handleReport = async () => {
    const reason = prompt("Why are you reporting this post?");
    if (!reason) return;
    await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "post", targetId: post.id, reason: reason.slice(0, 100) }),
    });
    setActionError("Thanks — our moderators will review this post");
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={post.author?.avatar_url || ""} alt="" />
            <AvatarFallback name={post.author?.display_name || post.author?.username} />
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{post.author?.display_name || post.author?.username}</span>
              <span className="text-muted-foreground text-sm">@{post.author?.username}</span>
              <span className="text-muted-foreground text-sm" aria-hidden="true">·</span>
              <time className="text-muted-foreground text-sm">{formatRelativeTime(post.created_at)}</time>
              <span className="ml-auto flex gap-1">
                {!isOwner && currentUserId && (
                  <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" onClick={handleReport} aria-label="Report post">
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
            {post.content && <p className="mt-1 whitespace-pre-wrap break-words">{post.content}</p>}
            {post.media && post.media.length > 0 && (
              <div className="mt-2 grid gap-2 grid-cols-2">
                {post.media.map((m: PostMedia) => (
                  <div key={m.id} className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                    {m.media_type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt="Post attachment" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <video src={m.url} controls preload="metadata" className="absolute inset-0 h-full w-full" />
                    )}
                  </div>
                ))}
              </div>
            )}
            {actionError && <p role="status" className="mt-2 text-xs text-muted-foreground">{actionError}</p>}
            <div className="flex items-center gap-1 mt-3 pt-3 border-t">
              <Button
                variant="ghost"
                size="sm"
                className={cn("gap-1 min-h-[44px]", liked && "text-red-500")}
                onClick={toggleLike}
                aria-pressed={liked}
                aria-label={liked ? "Unlike post" : "Like post"}
              >
                <Heart className={cn("h-4 w-4", liked && "fill-current")} aria-hidden="true" />
                <span>{likeCount}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 min-h-[44px]"
                onClick={() => setShowComments((v) => !v)}
                aria-expanded={showComments}
                aria-label={showComments ? "Hide comments" : "Show comments"}
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                <span>{commentCount}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn("gap-1 min-h-[44px]", saved && "text-primary")}
                onClick={toggleSave}
                aria-pressed={saved}
                aria-label={saved ? "Unsave post" : "Save post"}
              >
                <Bookmark className={cn("h-4 w-4", saved && "fill-current")} aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="sm" className="gap-1 min-h-[44px] ml-auto" onClick={handleShare} aria-label="Share post">
                <Share2 className="h-4 w-4" aria-hidden="true" />
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
    </Card>
  );
}

interface CommentItem {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
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
      setComments((prev) => [...prev, data.comment]);
      onCountChange(comments.length + 1);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setIsPosting(false);
    }
  };

  const deleteComment = async (id: string) => {
    const prev = comments;
    setComments((c) => c.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/comments?id=${id}`, { method: "DELETE" });
      if (!res.ok) setComments(prev);
      else onCountChange(prev.length - 1);
    } catch {
      setComments(prev);
    }
  };

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      {isLoading && <p className="text-sm text-muted-foreground">Loading comments…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!isLoading && comments.length === 0 && (
        <p className="text-sm text-muted-foreground">No comments yet. Start the conversation!</p>
      )}
      <ul className="space-y-2">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-2">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={c.author?.avatar_url || ""} alt="" />
              <AvatarFallback name={c.author?.display_name || c.author?.username} />
            </Avatar>
            <div className="flex-1 min-w-0 rounded-lg bg-muted/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{c.author?.display_name || c.author?.username}</span>
                <time className="text-xs text-muted-foreground">{formatRelativeTime(c.created_at)}</time>
                {c.author_id === currentUserId && (
                  <button
                    onClick={() => deleteComment(c.id)}
                    className="ml-auto text-xs text-muted-foreground hover:text-destructive min-h-[32px] px-2"
                    aria-label="Delete comment"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{c.content}</p>
            </div>
          </li>
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
            className="flex-1 min-h-[44px] rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button type="submit" size="sm" className="min-h-[44px]" disabled={isPosting || !draft.trim()}>
            {isPosting ? "…" : "Reply"}
          </Button>
        </form>
      )}
    </div>
  );
}
