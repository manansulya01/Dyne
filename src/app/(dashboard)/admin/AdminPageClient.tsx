"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

interface Stats {
  users: number;
  posts: number;
  pendingReports: number;
  events: number;
  communities: number;
  videos: number;
}

interface AdminUser {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  created_at: string;
}

interface ReportItem {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
  reporter: { username: string; display_name: string | null } | null;
}

export function AdminPageClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [s, u, r] = await Promise.all([
        fetch("/api/admin/stats").then((res) => res.json()),
        fetch("/api/admin/users?limit=30").then((res) => res.json()),
        fetch("/api/reports?status=pending&limit=30").then((res) => res.json()),
      ]);
      setStats(s.stats ?? null);
      setUsers(u.users ?? []);
      setReports(r.reports ?? []);
    } catch {
      setError("Failed to load admin data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial dashboard load only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const searchUsers = async (q: string) => {
    setUserSearch(q);
    const res = await fetch(`/api/admin/users?limit=30&search=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (res.ok) setUsers(data.users ?? []);
  };

  const setRole = async (userId: string, role: string) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    }
  };

  const reviewReport = async (id: string, status: "reviewing" | "resolved" | "dismissed", action?: string) => {
    const res = await fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, action }),
    });
    if (res.ok) {
      setReports((prev) => prev.filter((r) => r.id !== id));
      load();
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-label="Loading admin dashboard">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Admin dashboard</h1>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="list" aria-label="Platform statistics">
          {[
            ["Users", stats.users],
            ["Posts", stats.posts],
            ["Pending reports", stats.pendingReports],
            ["Events", stats.events],
            ["Communities", stats.communities],
            ["Videos", stats.videos],
          ].map(([label, value]) => (
            <Card key={label as string} role="listitem">
              <CardContent className="pt-4 text-center">
                <p className="text-3xl font-bold">{value}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="reports" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="reports" className="min-h-[44px]">Reports</TabsTrigger>
          <TabsTrigger value="users" className="min-h-[44px]">Users</TabsTrigger>
          <TabsTrigger value="content" className="min-h-[44px]">Content</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-4 space-y-3">
          {reports.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No pending reports. 🎉</p>
          )}
          {reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium uppercase bg-muted rounded px-2 py-1">{r.target_type}</span>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    by @{r.reporter?.username ?? "unknown"}
                  </span>
                </div>
                <p className="text-sm font-medium">{r.reason}</p>
                {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                <p className="text-xs font-mono break-all text-muted-foreground">{r.target_id}</p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => reviewReport(r.id, "reviewing")}>
                    Reviewing
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => reviewReport(r.id, "resolved", "content_removal")}>
                    Resolve + remove content
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => reviewReport(r.id, "resolved", "warning")}>
                    Resolve + warn
                  </Button>
                  <Button size="sm" variant="ghost" className="min-h-[44px]" onClick={() => reviewReport(r.id, "dismissed", "dismiss")}>
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-3">
          <Input
            value={userSearch}
            onChange={(e) => searchUsers(e.target.value)}
            placeholder="Search users…"
            aria-label="Search users"
            className="min-h-[44px]"
          />
          {users.map((u) => (
            <Card key={u.id}>
              <CardContent className="pt-4 flex items-center gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium truncate">{u.display_name || u.username}</p>
                  <p className="text-xs text-muted-foreground">@{u.username} · {u.role}</p>
                </div>
                <label className="ml-auto flex items-center gap-2 text-sm">
                  Role
                  <select
                    value={u.role}
                    onChange={(e) => setRole(u.id, e.target.value)}
                    className="min-h-[44px] rounded-md border border-input bg-background px-2"
                    aria-label={`Role for ${u.username}`}
                  >
                    <option value="student">student</option>
                    <option value="teacher">teacher</option>
                    <option value="staff">staff</option>
                    <option value="club">club</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="content" className="mt-4">
          <AdminContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AdminContent() {
  const [tab, setTab] = useState<"blog" | "announcement" | "building" | "club">("blog");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blog, setBlog] = useState({ title: "", category: "", excerpt: "", content: "", coverImageUrl: "", isPublished: true, isFeatured: false });
  const [ann, setAnn] = useState({ title: "", body: "", category: "", isPinned: false });
  const [place, setPlace] = useState({ name: "", description: "" });

  const post = async (url: string, body: unknown) => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const first = typeof json?.error === "string" ? json.error : json?.error ? JSON.stringify(json.error) : "Failed";
        throw new Error(first);
      }
      setStatus("Saved — live immediately, no mocks.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Content type">
        {(["blog", "announcement", "building", "club"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setStatus(null); }} aria-pressed={tab === t}
            className={`min-h-[44px] rounded-xl px-4 text-sm font-medium capitalize ${tab === t ? "bg-primary text-primary-foreground" : "border border-border"}`}>
            {t === "blog" ? "Blog article" : t}
          </button>
        ))}
      </div>

      {tab === "blog" && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void post("/api/blogs", { ...blog, coverImageUrl: blog.coverImageUrl || undefined }); }}>
          <Input value={blog.title} onChange={(e) => setBlog({ ...blog, title: e.target.value })} placeholder="Title" required maxLength={200} className="min-h-[48px]" aria-label="Article title" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={blog.category} onChange={(e) => setBlog({ ...blog, category: e.target.value })} placeholder="Category (e.g. Announcements)" maxLength={50} className="min-h-[44px]" aria-label="Category" />
            <Input value={blog.coverImageUrl} onChange={(e) => setBlog({ ...blog, coverImageUrl: e.target.value })} placeholder="Cover image URL (optional)" className="min-h-[44px]" aria-label="Cover image URL" />
          </div>
          <Input value={blog.excerpt} onChange={(e) => setBlog({ ...blog, excerpt: e.target.value })} placeholder="Excerpt (optional)" maxLength={500} className="min-h-[44px]" aria-label="Excerpt" />
          <textarea value={blog.content} onChange={(e) => setBlog({ ...blog, content: e.target.value })} placeholder="Article body…" required rows={6} maxLength={50000} className="w-full rounded-md border border-input bg-background p-3 text-sm" aria-label="Article body" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={blog.isPublished} onChange={(e) => setBlog({ ...blog, isPublished: e.target.checked })} /> Publish immediately</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={blog.isFeatured} onChange={(e) => setBlog({ ...blog, isFeatured: e.target.checked })} /> Feature on blogs page</label>
          <Button type="submit" disabled={busy} className="min-h-[48px] w-full">{busy ? "Publishing…" : "Publish article"}</Button>
        </form>
      )}

      {tab === "announcement" && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void post("/api/announcements", ann); }}>
          <Input value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} placeholder="Announcement title" required maxLength={200} className="min-h-[48px]" aria-label="Announcement title" />
          <textarea value={ann.body} onChange={(e) => setAnn({ ...ann, body: e.target.value })} placeholder="What should campus know?" required rows={4} maxLength={10000} className="w-full rounded-md border border-input bg-background p-3 text-sm" aria-label="Announcement body" />
          <Input value={ann.category} onChange={(e) => setAnn({ ...ann, category: e.target.value })} placeholder="Category (optional)" maxLength={50} className="min-h-[44px]" aria-label="Category" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ann.isPinned} onChange={(e) => setAnn({ ...ann, isPinned: e.target.checked })} /> Pin to schedule & explore</label>
          <Button type="submit" disabled={busy} className="min-h-[48px] w-full">{busy ? "Posting…" : "Post announcement"}</Button>
        </form>
      )}

      {(tab === "building" || tab === "club") && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void post(tab === "building" ? "/api/campus/buildings" : "/api/campus/clubs", { name: place.name, description: place.description || undefined }); }}>
          <Input value={place.name} onChange={(e) => setPlace({ ...place, name: e.target.value })} placeholder={tab === "building" ? "Building name" : "Club name"} required maxLength={100} className="min-h-[48px]" aria-label="Name" />
          <textarea value={place.description} onChange={(e) => setPlace({ ...place, description: e.target.value })} placeholder="Description…" rows={3} maxLength={2000} className="w-full rounded-md border border-input bg-background p-3 text-sm" aria-label="Description" />
          <Button type="submit" disabled={busy} className="min-h-[48px] w-full">{busy ? "Saving…" : `Add ${tab}`}</Button>
        </form>
      )}

      {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
      <p className="text-xs text-muted-foreground">Timetable periods are managed on the <Link href="/timetable" className="underline">timetable page</Link> (staff and admin). Events are created from <Link href="/events" className="underline">events</Link>.</p>
    </div>
  );
}
