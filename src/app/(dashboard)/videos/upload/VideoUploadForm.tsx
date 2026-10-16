"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";
import { ArrowLeft, Upload } from "lucide-react";

/**
 * Horizontal video upload (teacher/admin — enforced by `videos.create`).
 *
 * Separate from the Reels uploader on purpose: landscape long-form has its own
 * form, its own copy, and its own bucket policy. Server-side validation and
 * moderation still apply independently.
 */

const MAX_BYTES = 500 * 1024 * 1024;
const ACCEPTED = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_SECONDS = 6 * 60 * 60;

export function VideoUploadForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const probeRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const thumbUrlRef = useRef<string | null>(null);

  const onPick = (f: File | null) => {
    setError(null);
    setResult(null);
    setDuration(null);
    setDimensions(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!ACCEPTED.includes(f.type)) {
      setError("Videos must be MP4, WebM or MOV.");
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File is larger than the 500MB limit.");
      setFile(null);
      return;
    }
    setFile(f);
  };

  const onPickThumb = (f: File | null) => {
    setError(null);
    setResult(null);
    if (thumbUrlRef.current) {
      URL.revokeObjectURL(thumbUrlRef.current);
      thumbUrlRef.current = null;
    }
    if (!f) {
      setThumb(null);
      setThumbPreview(null);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      setError("Thumbnail must be JPEG, PNG or WebP.");
      setThumb(null);
      setThumbPreview(null);
      return;
    }
    setThumb(f);
    const url = URL.createObjectURL(f);
    thumbUrlRef.current = url;
    setThumbPreview(url);
  };

  // Revoke the thumbnail object URL on unmount.
  useEffect(() => {
    return () => {
      if (thumbUrlRef.current) URL.revokeObjectURL(thumbUrlRef.current);
    };
  }, []);

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
    setError(null);
    setResult(null);
    if (!title.trim() || title.trim().length < 3) {
      setError("Title must be at least 3 characters.");
      return;
    }
    if (!file) {
      setError("Choose a video file.");
      return;
    }
    if (duration !== null && duration > MAX_SECONDS) {
      setError("Video is longer than 6 hours.");
      return;
    }
    setBusy(true);
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
          duration: duration ?? undefined,
          width: dimensions?.width,
          height: dimensions?.height,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const first =
          typeof data.error === "string"
            ? data.error
            : data.error
              ? Object.values(data.error).flat().find((v: unknown) => typeof v === "string")
              : null;
        throw new Error(first || "Could not save the video");
      }
      setResult(data.moderationStatus as string);
      setTitle("");
      setDescription("");
      setFile(null);
      setThumb(null);
      if (thumbUrlRef.current) {
        URL.revokeObjectURL(thumbUrlRef.current);
        thumbUrlRef.current = null;
      }
      setThumbPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
          <Link href="/videos">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </Link>
        </Button>
        <h1 className="text-xl font-bold tracking-tight">Upload a video</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Landscape, long-form campus video (up to 500MB). Short vertical clips belong in{" "}
        <Link href="/reels/upload" className="font-medium text-primary hover:underline">
          Reels
        </Link>
        . Everything passes campus moderation before publishing.
      </p>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="hv-file" className="text-sm font-medium">
                Video file (MP4 / WebM / MOV)
              </label>
              <input
                id="hv-file"
                ref={fileRef}
                type="file"
                accept={ACCEPTED.join(",")}
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                className="mt-1 block min-h-[44px] w-full text-sm"
                required
              />
              {file && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB
                  {duration !== null ? ` · ${Math.round(duration / 60)}m` : ""}
                  {dimensions ? ` · ${dimensions.width}×${dimensions.height}` : ""}
                </p>
              )}
            </div>

            {/* Hidden probe: reads duration and dimensions only. */}
            {file && (
              <video
                ref={probeRef}
                className="hidden"
                muted
                playsInline
                preload="metadata"
                src={URL.createObjectURL(file)}
                onLoadedMetadata={(e) => {
                  const el = e.currentTarget;
                  setDuration(Number.isFinite(el.duration) ? el.duration : null);
                  setDimensions({ width: el.videoWidth, height: el.videoHeight });
                }}
              />
            )}

            <div>
              <label htmlFor="hv-title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="hv-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                className="mt-1 min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="hv-desc" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="hv-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                rows={3}
                className="mt-1"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="hv-cat" className="text-sm font-medium">
                  Category (optional)
                </label>
                <Input
                  id="hv-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  maxLength={50}
                  placeholder="lecture, event, club…"
                  className="mt-1 min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor="hv-thumb" className="text-sm font-medium">
                  Thumbnail (optional)
                </label>
                <input
                  id="hv-thumb"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => onPickThumb(e.target.files?.[0] ?? null)}
                  className="mt-1 block min-h-[44px] w-full text-sm"
                />
                {thumbPreview && (
                  // Blob object URL: next/image optimization does not apply.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbPreview}
                    alt="Thumbnail preview"
                    className="mt-2 h-20 w-auto rounded border"
                  />
                )}
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {result && (
              <p role="status" className="text-sm text-muted-foreground">
                {result === "approved"
                  ? "Published to the video library."
                  : result === "rejected"
                    ? "Not published: this video did not pass campus safety checks."
                    : "Submitted and awaiting moderator review."}
              </p>
            )}

            <Button type="submit" disabled={busy} className="min-h-[48px] w-full">
              <Upload className="h-4 w-4" aria-hidden="true" />
              {busy ? "Uploading…" : "Upload video"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
