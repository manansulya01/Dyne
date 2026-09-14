"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { formatRelativeTime } from "@/lib/utils";
import { Upload, Play, Trash2 } from "lucide-react";

interface VideoItem {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  creator_id: string;
  view_count: number;
  category: string | null;
  created_at: string;
  creator: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
}

export function WatchPageClient() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchVideos = useCallback(async (mine: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos?limit=24${mine ? "&mine=true" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load videos");
      setVideos(data.videos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load videos");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load only: video list + current user id.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchVideos(filter === "mine");
    import("@/lib/supabase/browser").then(async ({ createClient }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
    });
  }, [fetchVideos, filter]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this video?")) return;
    const prev = videos;
    setVideos((v) => v.filter((x) => x.id !== id));
    const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
    if (!res.ok) setVideos(prev);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Dyne Watch</h1>
        <div className="flex gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            className="min-h-[44px]"
            onClick={() => setFilter("all")}
          >
            Discover
          </Button>
          <Button
            variant={filter === "mine" ? "default" : "outline"}
            size="sm"
            className="min-h-[44px]"
            onClick={() => setFilter("mine")}
          >
            My videos
          </Button>
          <Button size="sm" className="min-h-[44px]" onClick={() => setShowUpload((v) => !v)}>
            <Upload className="h-4 w-4 mr-1" aria-hidden="true" />
            Upload
          </Button>
        </div>
      </div>

      {showUpload && (
        <UploadForm
          onUploaded={(v) => {
            setVideos((prev) => [v, ...prev]);
            setShowUpload(false);
          }}
        />
      )}

      {isLoading && (
        <div className="flex justify-center py-12" role="status" aria-label="Loading videos">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive text-center">{error}</p>}

      {!isLoading && !error && videos.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Play className="h-10 w-10 mx-auto mb-3 opacity-50" aria-hidden="true" />
            <p className="font-medium">No videos yet</p>
            <p className="text-sm mt-1">Upload the first campus video!</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => (
          <Card key={v.id} className="overflow-hidden">
            <Link href={`/watch/${v.id}`} className="block">
              <div className="relative aspect-video bg-muted">
                {v.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumbnail_url} alt={v.title} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                ) : (
                  <video src={v.video_url} preload="metadata" muted playsInline className="absolute inset-0 h-full w-full object-cover" />
                )}
                <span className="absolute bottom-2 right-2 text-xs bg-black/70 text-white rounded px-1.5 py-0.5">
                  {v.view_count} views
                </span>
              </div>
            </Link>
            <CardContent className="pt-3">
              <Link href={`/watch/${v.id}`} className="block min-h-[44px]">
                <p className="font-medium line-clamp-2">{v.title}</p>
              </Link>
              <div className="flex items-center gap-2 mt-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={v.creator?.avatar_url || ""} alt="" />
                  <AvatarFallback name={v.creator?.display_name || v.creator?.username} />
                </Avatar>
                <span className="text-xs text-muted-foreground truncate">
                  {v.creator?.display_name || v.creator?.username}
                </span>
                <time className="text-xs text-muted-foreground ml-auto shrink-0">{formatRelativeTime(v.created_at)}</time>
                {currentUserId === v.creator_id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-[36px] min-w-[36px] text-destructive shrink-0"
                    onClick={() => handleDelete(v.id)}
                    aria-label="Delete video"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function UploadForm({ onUploaded }: { onUploaded: (v: VideoItem) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (f: File, bucket: string): Promise<string> => {
    const formData = new FormData();
    formData.append("file", f);
    formData.append("bucket", bucket);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Failed to upload ${f.name}`);
    return data.media.url as string;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !file) {
      setError("Title and video file are required");
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      const videoUrl = await uploadFile(file, "watch-videos");
      const thumbnailUrl = thumb ? await uploadFile(thumb, "video-thumbnails") : undefined;
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          videoUrl,
          thumbnailUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Failed to save video");
      onUploaded(data.video);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <form onSubmit={submit} className="space-y-3">
          <h2 className="font-semibold">Upload a video</h2>
          <div>
            <label htmlFor="video-title" className="text-sm font-medium">Title</label>
            <Input id="video-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required className="min-h-[44px]" />
          </div>
          <div>
            <label htmlFor="video-desc" className="text-sm font-medium">Description</label>
            <Textarea id="video-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={3} />
          </div>
          <div>
            <label htmlFor="video-cat" className="text-sm font-medium">Category (optional)</label>
            <Input id="video-cat" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={50} placeholder="lecture, event, club…" className="min-h-[44px]" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="video-file" className="text-sm font-medium">Video file (max 50MB)</label>
              <input
                id="video-file"
                ref={fileRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm mt-1 min-h-[44px]"
                required
              />
            </div>
            <div>
              <label htmlFor="video-thumb" className="text-sm font-medium">Thumbnail (optional)</label>
              <input
                id="video-thumb"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setThumb(e.target.files?.[0] ?? null)}
                className="block w-full text-sm mt-1 min-h-[44px]"
              />
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={isUploading} className="min-h-[44px]">
            {isUploading ? "Uploading…" : "Publish video"}
          </Button>
          <p className="text-xs text-muted-foreground">Videos are stored securely and play back directly. No external transcoding is used.</p>
        </form>
      </CardContent>
    </Card>
  );
}
