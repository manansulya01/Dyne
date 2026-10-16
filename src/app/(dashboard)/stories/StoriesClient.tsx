"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Image as ImageIcon } from "lucide-react";

/**
 * Stories: ephemeral author posts with a hard expiry.
 *
 * Teachers and admins create them; everyone can view the approved, unexpired
 * ones. Expiry is enforced server-side on read, on the media route, and by a
 * TTL index — so nothing here can create permanent content.
 */

interface StoryGroup {
  author: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  stories: StoryItem[];
}

interface StoryItem {
  id: string;
  author_id: string;
  author: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  media_type: "image" | "video" | "text";
  media_url: string | null;
  thumbnail_url: string | null;
  text: string | null;
  background: string | null;
  caption: string | null;
  expires_at: string | null;
  view_count: number;
  moderation_status: string;
  created_at: string;
}

const BACKGROUNDS = ["bg-slate-900", "bg-emerald-900", "bg-indigo-900", "bg-rose-900", "bg-slate-800"];

export function StoriesClient({
  initialGroups,
  canCreate,
  currentUserId,
}: {
  initialGroups: StoryGroup[];
  canCreate: boolean;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<StoryGroup[]>(initialGroups);
  const [showComposer, setShowComposer] = useState(false);
  const [viewing, setViewing] = useState<StoryItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/stories?limit=100");
    if (!res.ok) return;
    const data = await res.json();
    const byAuthor = new Map<string, StoryGroup>();
    for (const s of (data.stories ?? []) as StoryItem[]) {
      const key = s.author_id;
      const existing = byAuthor.get(key);
      if (existing) existing.stories.push(s);
      else byAuthor.set(key, { author: s.author, stories: [s] });
    }
    setGroups([...byAuthor.values()]);
  };

  useEffect(() => {
    // Views are recorded server-side when a story is opened.
    if (!viewing || !currentUserId) return;
    fetch(`/api/stories/${viewing.id}`).catch(() => {});
  }, [viewing, currentUserId]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Stories</h1>
          <p className="text-sm text-muted-foreground">
            Short-lived campus updates. Stories expire automatically — nothing here is permanent.
          </p>
        </div>
        {canCreate && (
          <Button size="sm" className="min-h-[44px]" onClick={() => setShowComposer((v) => !v)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New story
          </Button>
        )}
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
          {notice}
        </p>
      )}

      {showComposer && canCreate && (
        <StoryComposer
          onDone={async (status) => {
            setShowComposer(false);
            await refresh();
            setNotice(
              status === "approved"
                ? "Story published."
                : status === "rejected"
                  ? "Story not published: it did not pass campus safety checks."
                  : "Story submitted and awaiting moderator review."
            );
            router.refresh();
          }}
          onError={(m) => setNotice(m)}
        />
      )}

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <ImageIcon className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">No active stories</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canCreate
              ? "Create the first campus story."
              : "Check back later — teachers and admins post stories here."}
          </p>
        </div>
      ) : (
        <div className="dyne-scroll flex gap-3 overflow-x-auto pb-2" role="list" aria-label="Active stories">
          {groups.map((g) => {
            const first = g.stories[0];
            const authorId = g.author?.id ?? "";
            return (
              <button
                key={authorId}
                role="listitem"
                onClick={() => first && setViewing(first)}
                className="flex min-h-[44px] w-20 shrink-0 flex-col items-center gap-1"
                aria-label={`${g.author?.display_name || g.author?.username}'s story, ${g.stories.length} available`}
              >
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary bg-muted">
                  <Avatar className="h-14 w-14">
                    <AvatarImage src={g.author?.avatar_url || ""} alt="" />
                    <AvatarFallback name={g.author?.display_name || g.author?.username} />
                  </Avatar>
                  {g.stories.length > 1 && (
                    <span className="absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                      {g.stories.length}
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-[11px] text-muted-foreground">
                  {g.author?.display_name || g.author?.username}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {viewing && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Story"
          onClick={() => setViewing(null)}
        >
          <div
            className={cn(
              "relative aspect-[9/16] w-full max-w-[420px] overflow-hidden rounded-2xl",
              viewing.background ?? "bg-slate-900"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {viewing.media_type === "image" && viewing.media_url && (
              // eslint-disable-next-line @next/next/no-img-element -- app-served story media
              <img src={viewing.media_url} alt={viewing.caption ?? "Story"} className="h-full w-full object-cover" />
            )}
            {viewing.media_type === "video" && viewing.media_url && (
              <video
                src={viewing.media_url}
                controls
                autoPlay
                playsInline
                className="h-full w-full object-cover"
                aria-label={viewing.caption ?? "Story video"}
              />
            )}
            {viewing.media_type === "text" && (
              <div className="flex h-full items-center justify-center p-6">
                <p className="whitespace-pre-wrap text-center text-lg font-semibold text-white">
                  {viewing.text}
                </p>
              </div>
            )}

            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-3">
              <span className="truncate text-sm font-semibold text-white">
                {viewing.author?.display_name || viewing.author?.username}
              </span>
              <button
                onClick={() => setViewing(null)}
                aria-label="Close story"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
              >
                ×
              </button>
            </div>
            {viewing.caption && (
              <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-sm text-white">
                {viewing.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StoryComposer({
  onDone,
  onError,
}: {
  onDone: (status: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [kind, setKind] = useState<"text" | "image" | "video">("text");
  const [text, setText] = useState("");
  const [caption, setCaption] = useState("");
  const [background, setBackground] = useState(BACKGROUNDS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [lifetime, setLifetime] = useState("86400");
  const [busy, setBusy] = useState(false);

  const uploadFile = async (f: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", f);
    formData.append("bucket", "story-media");
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data.media.url as string;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const mediaUrl = file ? await uploadFile(file) : undefined;
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType: kind,
          text: kind === "text" ? text : undefined,
          caption: caption || undefined,
          background: kind === "text" ? background : undefined,
          mediaUrl,
          lifetimeSeconds: Number(lifetime),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the story");
      setText("");
      setCaption("");
      setFile(null);
      await onDone(data.moderationStatus as string);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create the story");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-1.5" role="group" aria-label="Story type">
            {(["text", "image", "video"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={cn(
                  "min-h-[44px] rounded-xl px-4 text-sm font-medium capitalize",
                  kind === k ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
                )}
              >
                {k}
              </button>
            ))}
          </div>

          {kind === "text" && (
            <>
              <div>
                <label htmlFor="story-text" className="text-sm font-medium">
                  Story text
                </label>
                <textarea
                  id="story-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  required
                  className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm"
                />
              </div>
              <div className="flex gap-1.5" role="group" aria-label="Background">
                {BACKGROUNDS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBackground(b)}
                    aria-label={`Background ${b.replace("bg-", "")}`}
                    aria-pressed={background === b}
                    className={cn("h-11 w-11 rounded-xl border-2", b, background === b ? "border-primary" : "border-transparent")}
                  />
                ))}
              </div>
            </>
          )}

          {kind !== "text" && (
            <div>
              <label htmlFor="story-file" className="text-sm font-medium">
                {kind === "image" ? "Image" : "Video"} file
              </label>
              <input
                id="story-file"
                type="file"
                accept={kind === "image" ? "image/*" : "video/mp4,video/webm,video/quicktime"}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
                className="mt-1 block min-h-[44px] w-full text-sm"
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="story-caption" className="text-sm font-medium">
                Caption (optional)
              </label>
              <input
                id="story-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={300}
                className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="story-lifetime" className="text-sm font-medium">
                Expires after
              </label>
              <select
                id="story-lifetime"
                value={lifetime}
                onChange={(e) => setLifetime(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="3600">1 hour</option>
                <option value="21600">6 hours</option>
                <option value="86400">24 hours</option>
                <option value="172800">2 days</option>
                <option value="604800">7 days</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={busy} className="min-h-[48px]">
              {busy ? "Posting…" : "Post story"}
            </Button>
            <Button type="reset" variant="ghost" className="min-h-[48px]">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Clear
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Stories disappear when they expire — between 1 hour and 7 days. Content is moderated before it
            appears.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
