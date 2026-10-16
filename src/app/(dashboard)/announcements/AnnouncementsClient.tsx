"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn, formatDate } from "@/lib/utils";
import { Megaphone, Send, Trash2 } from "lucide-react";

/**
 * Campus announcements (teacher/admin authoring).
 *
 * Every publish goes through the announcement pipeline, which moderates the
 * content and then fans out one notification per recipient (idempotently).
 */

interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string | null;
  priority: string;
  audience: string;
  is_pinned: boolean;
  link_url: string | null;
  attachment_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  author?: { username: string; display_name: string | null } | null;
}

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const AUDIENCES = ["all", "students", "teachers", "staff"] as const;

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  urgent: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export function AnnouncementsClient({
  initialAnnouncements,
  canManage,
  isAdmin,
  classes,
}: {
  initialAnnouncements: Announcement[];
  canManage: boolean;
  isAdmin: boolean;
  classes: string[];
}) {
  const [items, setItems] = useState<Announcement[]>(initialAnnouncements);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/announcements?limit=50");
    if (!res.ok) return;
    const data = await res.json();
    setItems((data.announcements ?? []) as Announcement[]);
  }, []);

  const remove = async (id: string) => {
    if (!window.confirm("Delete this announcement?")) return;
    const res = await fetch("/api/announcements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setItems((prev) => prev.filter((a) => a.id !== id));
      setNotice("Announcement deleted.");
    } else {
      setNotice("Only admins can delete announcements.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Announcements</h1>
        <p className="text-sm text-muted-foreground">
          Campus-wide notices from teachers and admins. Published announcements also appear in every
          recipient&apos;s notifications.
        </p>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
          {notice}
        </p>
      )}

      {canManage && (
        <AnnouncementComposer
          classes={classes}
          onPublished={async (message) => {
            setNotice(message);
            await refresh();
          }}
          onError={(m) => setNotice(m)}
          busy={busy}
          setBusy={setBusy}
        />
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <Megaphone className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">No announcements</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage ? "Publish the first campus announcement." : "Nothing to announce right now."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id}>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={cn(PRIORITY_STYLE[a.priority] ?? PRIORITY_STYLE.normal)}>
                      {a.priority}
                    </Badge>
                    <Badge variant="outline">{a.audience}</Badge>
                    {a.is_pinned && <Badge variant="secondary">Pinned</Badge>}
                    {a.category && <span className="text-xs text-muted-foreground">{a.category}</span>}
                    <time className="ml-auto text-xs text-muted-foreground">
                      {formatDate(a.created_at)}
                    </time>
                  </div>
                  <h2 className="mt-2 text-base font-semibold">{a.title}</h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{a.body}</p>
                  {a.ends_at && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Expires {formatDate(a.ends_at)}
                    </p>
                  )}
                  {a.link_url && (
                    <a
                      href={a.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
                    >
                      Open link
                    </a>
                  )}
                  {isAdmin && (
                    <div className="mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-[44px] text-destructive"
                        onClick={() => remove(a.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnnouncementComposer({
  classes,
  onPublished,
  onError,
  busy,
  setBusy,
}: {
  classes: string[];
  onPublished: (message: string) => void | Promise<void>;
  onError: (message: string) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<string>("normal");
  const [audience, setAudience] = useState<string>("all");
  const [classGrade, setClassGrade] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [publishNow, setPublishNow] = useState(true);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category: category.trim() || undefined,
          priority,
          audience,
          audienceClassGrade: classGrade || undefined,
          isPinned,
          linkUrl: linkUrl.trim() || undefined,
          endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
          publish: publishNow,
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
        throw new Error(first || "Could not publish");
      }
      setTitle("");
      setBody("");
      setCategory("");
      setLinkUrl("");
      setEndsAt("");
      setIsPinned(false);
      const message = data.heldForReview
        ? "Announcement held for moderator review — no notifications were sent."
        : data.published
          ? `Published. ${data.notified ?? 0} recipient${data.notified === 1 ? "" : "s"} notified.`
          : "Saved as a draft.";
      await onPublished(message);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <form onSubmit={submit} className="space-y-3">
          <h2 className="font-semibold">New announcement</h2>
          <div>
            <label htmlFor="ann-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="ann-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              className="mt-1 min-h-[44px]"
            />
          </div>
          <div>
            <label htmlFor="ann-body" className="text-sm font-medium">
              Message
            </label>
            <Textarea
              id="ann-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={10000}
              rows={4}
              required
              className="mt-1"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="ann-priority" className="text-sm font-medium">
                Priority
              </label>
              <select
                id="ann-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ann-audience" className="text-sm font-medium">
                Audience
              </label>
              <select
                id="ann-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ann-class" className="text-sm font-medium">
                Class (optional)
              </label>
              <select
                id="ann-class"
                value={classGrade}
                onChange={(e) => setClassGrade(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ann-category" className="text-sm font-medium">
                Category (optional)
              </label>
              <Input
                id="ann-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                maxLength={50}
                className="mt-1 min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="ann-link" className="text-sm font-medium">
                Link (optional)
              </label>
              <Input
                id="ann-link"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                maxLength={2000}
                placeholder="https://…"
                className="mt-1 min-h-[44px]"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ann-ends" className="text-sm font-medium">
              Expires (optional)
            </label>
            <input
              id="ann-ends"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 block min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
            />
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
            />
            Pin to the top
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={publishNow}
              onChange={(e) => setPublishNow(e.target.checked)}
            />
            Publish and notify the audience now
          </label>
          <Button type="submit" disabled={busy} className="min-h-[48px] w-full sm:w-auto">
            <Send className="h-4 w-4" aria-hidden="true" />
            {busy ? "Publishing…" : publishNow ? "Publish announcement" : "Save draft"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Content is checked by campus moderation. High-risk content is held or rejected; recipients are
            notified at most once per announcement.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
