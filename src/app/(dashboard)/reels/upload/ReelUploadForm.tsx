"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";
import { ArrowLeft, Upload } from "lucide-react";

/**
 * Reel upload (teacher/admin only — enforced server-side by `reels.create`).
 *
 * Client-side validation is a convenience only: the server re-validates MIME,
 * extension, magic bytes, size, and runs the moderation pipeline before
 * anything is published.
 */

/** Hard ceilings mirroring the server policy (see bucketPolicies). */
const MAX_BYTES = 100 * 1024 * 1024;
/** Reels are short-form; 90 seconds is the product limit. */
const MAX_SECONDS = 90;
const ACCEPTED = ["video/mp4", "video/webm", "video/quicktime"];

export function ReelUploadForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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
      setError("Reels must be MP4, WebM or MOV video.");
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File is larger than the 100MB reel limit.");
      setFile(null);
      return;
    }
    setFile(f);
  };

  const probe = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const el = videoRef.current;
    if (!el) {
      URL.revokeObjectURL(url);
      return;
    }
    el.src = url;
  };

  const onMetadata = () => {
    const el = videoRef.current;
    if (!el || !file) return;
    const seconds = Number.isFinite(el.duration) ? Math.round(el.duration) : null;
    setDuration(seconds);
    setDimensions({ width: el.videoWidth, height: el.videoHeight });
    if (seconds !== null && seconds > MAX_SECONDS) {
      setError(`Reels are limited to ${MAX_SECONDS} seconds. This clip is ${seconds}s.`);
    }
  };

  const uploadFile = async (f: File, bucket: string): Promise<string> => {
    const formData = new FormData();
    formData.append("file", f);
    formData.append("bucket", bucket);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Upload failed for ${f.name}`);
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
      setError("Choose a vertical video file.");
      return;
    }
    if (duration !== null && duration > MAX_SECONDS) {
      setError(`Reels are limited to ${MAX_SECONDS} seconds.`);
      return;
    }
    setBusy(true);
    try {
      const videoUrl = await uploadFile(file, "reel-videos");
      const thumbnailUrl = await new Promise<string | undefined>((resolve) => {
        // Grab a poster frame from the first second when the browser can.
        const el = videoRef.current;
        if (!el || !el.videoWidth) {
          resolve(undefined);
          return;
        }
        try {
          const canvas = document.createElement("canvas");
          canvas.width = el.videoWidth;
          canvas.height = el.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(undefined);
            return;
          }
          el.currentTime = Math.min(1, (el.duration || 1) / 2);
          el.onseeked = () => {
            ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
            el.onseeked = null;
            canvas.toBlob(
              async (blob) => {
                if (!blob) {
                  resolve(undefined);
                  return;
                }
                try {
                  resolve(await uploadFile(new File([blob], "reel-poster.jpg", { type: "image/jpeg" }), "video-thumbnails"));
                } catch {
                  resolve(undefined);
                }
              },
              "image/jpeg",
              0.8
            );
          };
        } catch {
          resolve(undefined);
        }
      });

      const res = await fetch("/api/reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          caption: caption.trim() || undefined,
          category: category.trim() || undefined,
          hashtags: hashtags
            .split(/[\s,]+/)
            .map((h) => h.replace(/^#/, ""))
            .filter(Boolean)
            .slice(0, 10),
          videoUrl,
          thumbnailUrl,
          durationSeconds: duration ?? undefined,
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
        throw new Error(first || "Upload failed");
      }
      setResult({
        status: data.moderationStatus as string,
      });
      setTitle("");
      setCaption("");
      setHashtags("");
      setFile(null);
      setDuration(null);
      if (fileInput.current) fileInput.current.value = "";
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
          <Link href="/reels">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </Link>
        </Button>
        <h1 className="text-xl font-bold tracking-tight">Upload a reel</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Vertical 9:16 clips, up to {MAX_SECONDS} seconds and {MAX_BYTES / 1024 / 1024}MB. Every reel
        passes through campus moderation before it appears in the feed.
      </p>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="reel-file" className="text-sm font-medium">
                Vertical video (MP4 / WebM / MOV)
              </label>
              <input
                id="reel-file"
                ref={fileInput}
                type="file"
                accept={ACCEPTED.join(",")}
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                className="mt-1 block min-h-[44px] w-full text-sm"
                required
              />
              {file && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB
                  {duration !== null ? ` · ${duration}s` : ""}
                  {dimensions ? ` · ${dimensions.width}×${dimensions.height}` : ""}
                </p>
              )}
            </div>

            {/* Hidden probe used to read duration/dimensions and the poster frame. */}
            <video
              ref={videoRef}
              className="hidden"
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={() => {
                onMetadata();
                probe();
              }}
            />

            <div>
              <label htmlFor="reel-title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="reel-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                className="mt-1 min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="reel-caption" className="text-sm font-medium">
                Caption
              </label>
              <Textarea
                id="reel-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={2000}
                rows={3}
                className="mt-1"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="reel-category" className="text-sm font-medium">
                  Category (optional)
                </label>
                <Input
                  id="reel-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  maxLength={50}
                  placeholder="campus, sport, music…"
                  className="mt-1 min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor="reel-hashtags" className="text-sm font-medium">
                  Hashtags
                </label>
                <Input
                  id="reel-hashtags"
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  maxLength={300}
                  placeholder="#mva #matchday"
                  className="mt-1 min-h-[44px]"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {result && (
              <p role="status" className="text-sm text-muted-foreground">
                {result.status === "approved"
                  ? "Published to the reels feed."
                  : result.status === "rejected"
                    ? "Not published: this reel did not pass campus safety checks."
                    : "Submitted and awaiting moderator review. It is not in the public feed yet."}
              </p>
            )}

            <Button type="submit" disabled={busy} className="min-h-[48px] w-full">
              <Upload className="h-4 w-4" aria-hidden="true" />
              {busy ? "Uploading…" : "Upload reel"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
