"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { ArrowLeft, Building2, Megaphone, Newspaper, Send, Users } from "lucide-react";

/**
 * Admin content authoring.
 *
 * Publishing a blog still runs the moderation pipeline server-side, so a
 * "publish" checkbox can never force unsafe content live.
 */

export function AdminContentPanel() {
  const [tab, setTab] = useState<"blog" | "announcement" | "building" | "club">("blog");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [blog, setBlog] = useState({
    title: "",
    category: "",
    excerpt: "",
    content: "",
    coverImageUrl: "",
    isPublished: true,
    isFeatured: false,
  });
  const [ann, setAnn] = useState({
    title: "",
    body: "",
    category: "",
    priority: "normal",
    audience: "all",
    isPinned: false,
    linkUrl: "",
    publish: true,
  });
  const [place, setPlace] = useState({ name: "", description: "" });

  const post = async (url: string, body: unknown, successMessage: string) => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const first =
          typeof json?.error === "string"
            ? json.error
            : json?.error
              ? Object.values(json.error).flat().find((v: unknown) => typeof v === "string")
              : "Failed";
        throw new Error(first);
      }
      const suffix =
        json?.moderationStatus && json.moderationStatus !== "approved"
          ? ` Held for review (${json.moderationStatus}) — not published yet.`
          : json?.notified !== undefined
            ? ` ${json.notified} recipient(s) notified.`
            : "";
      setStatus(`${successMessage}${suffix}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
        <Link href="/admin">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Admin console
        </Link>
      </Button>

      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Content</h1>
        <p className="text-sm text-muted-foreground">
          Publish campus content. Everything is stored in MongoDB and moderated before it goes live.
        </p>
      </div>

      {status && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
          {status}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Content type">
        {([
          { key: "blog" as const, label: "Blog article", icon: Newspaper },
          { key: "announcement" as const, label: "Announcement", icon: Megaphone },
          { key: "building" as const, label: "Building", icon: Building2 },
          { key: "club" as const, label: "Club", icon: Users },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setStatus(null);
            }}
            aria-pressed={tab === t.key}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-medium",
              tab === t.key ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "blog" && (
        <Card>
          <CardContent className="pt-4">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void post(
                  "/api/blogs",
                  { ...blog, coverImageUrl: blog.coverImageUrl || undefined },
                  "Article saved."
                );
              }}
            >
              <div>
                <label htmlFor="ac-blog-title" className="text-sm font-medium">
                  Title
                </label>
                <Input
                  id="ac-blog-title"
                  value={blog.title}
                  onChange={(e) => setBlog({ ...blog, title: e.target.value })}
                  maxLength={200}
                  required
                  className="mt-1 min-h-[44px]"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="ac-blog-category" className="text-sm font-medium">
                    Category
                  </label>
                  <Input
                    id="ac-blog-category"
                    value={blog.category}
                    onChange={(e) => setBlog({ ...blog, category: e.target.value })}
                    maxLength={50}
                    className="mt-1 min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="ac-blog-cover" className="text-sm font-medium">
                    Cover image URL (optional)
                  </label>
                  <Input
                    id="ac-blog-cover"
                    value={blog.coverImageUrl}
                    onChange={(e) => setBlog({ ...blog, coverImageUrl: e.target.value })}
                    maxLength={2048}
                    className="mt-1 min-h-[44px]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="ac-blog-excerpt" className="text-sm font-medium">
                  Excerpt
                </label>
                <Input
                  id="ac-blog-excerpt"
                  value={blog.excerpt}
                  onChange={(e) => setBlog({ ...blog, excerpt: e.target.value })}
                  maxLength={500}
                  className="mt-1 min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor="ac-blog-body" className="text-sm font-medium">
                  Body
                </label>
                <Textarea
                  id="ac-blog-body"
                  value={blog.content}
                  onChange={(e) => setBlog({ ...blog, content: e.target.value })}
                  rows={8}
                  maxLength={50000}
                  required
                  className="mt-1"
                />
              </div>
              <label className="flex min-h-[44px] items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={blog.isPublished}
                  onChange={(e) => setBlog({ ...blog, isPublished: e.target.checked })}
                />
                Publish immediately (subject to moderation)
              </label>
              <label className="flex min-h-[44px] items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={blog.isFeatured}
                  onChange={(e) => setBlog({ ...blog, isFeatured: e.target.checked })}
                />
                Feature on the blogs page
              </label>
              <Button type="submit" disabled={busy} className="min-h-[48px] w-full">
                <Send className="h-4 w-4" aria-hidden="true" /> {busy ? "Saving…" : "Save article"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {tab === "announcement" && (
        <Card>
          <CardContent className="pt-4">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void post("/api/announcements", ann, "Announcement saved.");
              }}
            >
              <div>
                <label htmlFor="ac-ann-title" className="text-sm font-medium">
                  Title
                </label>
                <Input
                  id="ac-ann-title"
                  value={ann.title}
                  onChange={(e) => setAnn({ ...ann, title: e.target.value })}
                  maxLength={200}
                  required
                  className="mt-1 min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor="ac-ann-body" className="text-sm font-medium">
                  Message
                </label>
                <Textarea
                  id="ac-ann-body"
                  value={ann.body}
                  onChange={(e) => setAnn({ ...ann, body: e.target.value })}
                  rows={5}
                  maxLength={10000}
                  required
                  className="mt-1"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="ac-ann-priority" className="text-sm font-medium">
                    Priority
                  </label>
                  <select
                    id="ac-ann-priority"
                    value={ann.priority}
                    onChange={(e) => setAnn({ ...ann, priority: e.target.value })}
                    className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {["low", "normal", "high", "urgent"].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ac-ann-audience" className="text-sm font-medium">
                    Audience
                  </label>
                  <select
                    id="ac-ann-audience"
                    value={ann.audience}
                    onChange={(e) => setAnn({ ...ann, audience: e.target.value })}
                    className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {["all", "students", "teachers", "staff"].map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ac-ann-category" className="text-sm font-medium">
                    Category
                  </label>
                  <Input
                    id="ac-ann-category"
                    value={ann.category}
                    onChange={(e) => setAnn({ ...ann, category: e.target.value })}
                    maxLength={50}
                    className="mt-1 min-h-[44px]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="ac-ann-link" className="text-sm font-medium">
                  Link (optional)
                </label>
                <Input
                  id="ac-ann-link"
                  value={ann.linkUrl}
                  onChange={(e) => setAnn({ ...ann, linkUrl: e.target.value })}
                  maxLength={2000}
                  placeholder="https://…"
                  className="mt-1 min-h-[44px]"
                />
              </div>
              <label className="flex min-h-[44px] items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ann.isPinned}
                  onChange={(e) => setAnn({ ...ann, isPinned: e.target.checked })}
                />
                Pin to the top
              </label>
              <label className="flex min-h-[44px] items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ann.publish}
                  onChange={(e) => setAnn({ ...ann, publish: e.target.checked })}
                />
                Publish and notify now
              </label>
              <Button type="submit" disabled={busy} className="min-h-[48px] w-full">
                <Send className="h-4 w-4" aria-hidden="true" /> {busy ? "Publishing…" : "Save announcement"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {(tab === "building" || tab === "club") && (
        <Card>
          <CardContent className="pt-4">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void post(
                  tab === "building" ? "/api/campus/buildings" : "/api/campus/clubs",
                  { name: place.name, description: place.description || undefined },
                  `${tab === "building" ? "Building" : "Club"} saved.`
                );
              }}
            >
              <div>
                <label htmlFor="ac-place-name" className="text-sm font-medium">
                  Name
                </label>
                <Input
                  id="ac-place-name"
                  value={place.name}
                  onChange={(e) => setPlace({ ...place, name: e.target.value })}
                  maxLength={100}
                  required
                  className="mt-1 min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor="ac-place-desc" className="text-sm font-medium">
                  Description
                </label>
                <Textarea
                  id="ac-place-desc"
                  value={place.description}
                  onChange={(e) => setPlace({ ...place, description: e.target.value })}
                  rows={4}
                  maxLength={2000}
                  className="mt-1"
                />
              </div>
              <Button type="submit" disabled={busy} className="min-h-[48px] w-full">
                {busy ? "Saving…" : `Add ${tab}`}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
