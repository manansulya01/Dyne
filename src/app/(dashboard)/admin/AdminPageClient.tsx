"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
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

interface FeedbackItem {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  admin_response: string | null;
  created_at: string;
}

interface AuditItem {
  _id: string;
  actorId: string | null;
  moderatorId?: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
  /** "audit" = privileged action, "moderation" = content decision. */
  source?: "audit" | "moderation";
}

const ALL_ROLES = ["student", "teacher", "staff", "club", "moderator", "admin", "super_admin"];

export function AdminPageClient({ currentRole }: { currentRole?: string } = {}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportStatus, setReportStatus] = useState("OPEN");
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  // Ref mirror so the lazy loaders can read the current status without
  // re-creating their callbacks on every keystroke.
  const reportStatusRef = useRef("OPEN");

  const isSuper = currentRole === "super_admin";

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Mount load only needs the dashboard tiles; the heavy lists (users,
      // reports, feedback, audit) are fetched by the tab that displays them,
      // which removed four redundant requests on every admin page view.
      const s = await fetch("/api/admin/stats").then((res) => res.json());
      setStats(s.stats ?? null);
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

  const loadReports = async (status: string) => {
    reportStatusRef.current = status;
    setReportStatus(status);
    const res = await fetch(`/api/reports?status=${encodeURIComponent(status)}&limit=30`);
    const data = await res.json().catch(() => null);
    if (res.ok) setReports(data.reports ?? []);
  };

  // Lazy tab loaders: each list is fetched when its tab is first opened.
  // Each tab fetches its list the first time it is opened (cached afterwards).
  const loadedRef = useRef({ users: false, reports: false, feedback: false, audit: false });
  const ensureUsers = useCallback(async () => {
    if (loadedRef.current.users) return;
    loadedRef.current.users = true;
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users?limit=30");
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setUsers(data.users ?? []);
        setUsersHasMore((data.users ?? []).length === 30);
      }
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const ensureReports = useCallback(async () => {
    if (loadedRef.current.reports) return;
    loadedRef.current.reports = true;
    await loadReports(reportStatusRef.current);
  }, []);

  const ensureFeedback = useCallback(async () => {
    if (loadedRef.current.feedback) return;
    loadedRef.current.feedback = true;
    const res = await fetch("/api/feedback?limit=20");
    const data = await res.json().catch(() => null);
    if (res.ok) setFeedback(data.feedback ?? []);
  }, []);

  const ensureAudit = useCallback(async () => {
    if (loadedRef.current.audit) return;
    loadedRef.current.audit = true;
    const res = await fetch("/api/admin/audit?limit=30");
    const data = await res.json().catch(() => null);
    if (res.ok) setAudit(data.actions ?? []);
  }, []);

  const searchUsers = async (q: string) => {
    setUserSearch(q);
    loadedRef.current.users = true;
    const res = await fetch(`/api/admin/users?limit=30&search=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (res.ok) {
      setUsers(data.users ?? []);
      setUsersHasMore((data.users ?? []).length === 30);
    }
  };

  const loadMoreUsers = async () => {
    if (loadingUsers || !usersHasMore || users.length === 0) return;
    setLoadingUsers(true);
    try {
      const last = users[users.length - 1] as unknown as { created_at?: string };
      const params = new URLSearchParams({ limit: "30", search: userSearch });
      if (last?.created_at) params.set("cursor", last.created_at);
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => [...prev, ...(data.users ?? [])]);
        setUsersHasMore((data.users ?? []).length === 30);
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  const confirmAction = (msg: string) => {
    if (typeof window !== "undefined") return window.confirm(msg);
    return true;
  };

  const setRole = async (userId: string, role: string) => {
    if (!confirmAction(`Change this user's role to ${role}? This will be logged.`)) return;
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      setNotice(`Role updated to ${role}. Logged to audit.`);
    } else {
      setNotice(data?.error ? `Failed: ${typeof data.error === "string" ? data.error : "Forbidden"}` : "Failed to update role");
    }
  };

  const suspendUser = async (userId: string) => {
    if (!confirmAction("Suspend this user for 7 days? This will be logged.")) return;
    const until = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, until }),
    });
    setNotice(res.ok ? "User suspended for 7 days. Logged." : "Suspension failed (check permissions).");
  };

  const unsuspendUser = async (userId: string) => {
    if (!confirmAction("Lift this user's suspension? This will be logged.")) return;
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setNotice(res.ok ? "Suspension lifted. Logged." : "Failed (check permissions).");
  };

  const reviewReport = async (id: string, status: string, action?: string, moderatorNotes?: string) => {
    if (!confirmAction(`Mark report as ${status}${action ? ` with action ${action}` : ""}?`)) return;
    const res = await fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, action, moderatorNotes: moderatorNotes || undefined }),
    });
    if (res.ok) {
      setReports((prev) => prev.filter((r) => r.id !== id));
      load();
    } else {
      setNotice("Moderation failed (check permissions).");
    }
  };

  const updateFeedback = async (id: string, status: string) => {
    const res = await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setFeedback((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
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
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">Admin dashboard</h1>
        {currentRole && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">Signed in as {currentRole}</span>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">{notice}</p>}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="list" aria-label="Platform statistics">
          {[
            ["Users", stats.users],
            ["Posts", stats.posts],
            ["Open reports", stats.pendingReports],
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
        <TabsList className="flex w-full">
          <TabsTrigger value="reports" className="min-h-[44px]">Reports</TabsTrigger>
          <TabsTrigger value="moderate" className="min-h-[44px]">Moderate</TabsTrigger>
          <TabsTrigger value="users" className="min-h-[44px]">Users</TabsTrigger>
          <TabsTrigger value="feedback" className="min-h-[44px]">Feedback</TabsTrigger>
          <TabsTrigger value="audit" className="min-h-[44px]">Audit</TabsTrigger>
          <TabsTrigger value="content" className="min-h-[44px]">Content</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-4 space-y-3" onFocus={ensureReports} onMouseDown={ensureReports}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Report status filter">
            {["OPEN", "UNDER_REVIEW", "ESCALATED", "ACTION_TAKEN", "DISMISSED"].map((s) => (
              <button
                key={s}
                onClick={() => loadReports(s)}
                aria-pressed={reportStatus === s}
                className={`min-h-[44px] rounded-lg border px-3 text-xs font-medium ${reportStatus === s ? "bg-primary text-primary-foreground" : "border-border"}`}
              >
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
          {reports.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No reports in this queue.</p>
          )}
          {reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium uppercase bg-muted rounded px-2 py-1">{r.target_type}</span>
                  <span className="text-xs font-medium uppercase bg-muted rounded px-2 py-1">{r.status}</span>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    by @{r.reporter?.username ?? "unknown"}
                  </span>
                </div>
                <p className="text-sm font-medium">{r.reason}</p>
                {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                <p className="text-xs font-mono break-all text-muted-foreground">{r.target_id}</p>
                <ReportNotesForm
                  onSubmit={(notes) => reviewReport(r.id, "UNDER_REVIEW", undefined, notes)}
                />
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => reviewReport(r.id, "UNDER_REVIEW")}>
                    Under review
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => reviewReport(r.id, "ESCALATED")}>
                    Escalate
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => reviewReport(r.id, "ACTION_TAKEN", "content_removal")}>
                    Remove content
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => reviewReport(r.id, "ACTION_TAKEN", "warning")}>
                    Warn
                  </Button>
                  <Button size="sm" variant="ghost" className="min-h-[44px]" onClick={() => reviewReport(r.id, "DISMISSED", "dismiss")}>
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="moderate" className="mt-4">
          <AdminModerate onNotice={setNotice} />
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-3" onFocus={ensureUsers} onMouseDown={ensureUsers}>
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
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-2 text-sm">
                    Role
                    <select
                      value={u.role}
                      onChange={(e) => setRole(u.id, e.target.value)}
                      className="min-h-[44px] rounded-md border border-input bg-background px-2"
                      aria-label={`Role for ${u.username}`}
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r} disabled={(r === "admin" || r === "super_admin") && !isSuper}>
                          {r}{((r === "admin" || r === "super_admin") && !isSuper) ? " (super-admin only)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => suspendUser(u.id)}>Suspend 7d</Button>
                  <Button size="sm" variant="ghost" className="min-h-[44px]" onClick={() => unsuspendUser(u.id)}>Unsuspend</Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {usersHasMore && users.length > 0 && (
            <Button variant="outline" className="min-h-[48px] w-full" onClick={loadMoreUsers} disabled={loadingUsers}>
              {loadingUsers ? "Loading…" : "Load more users"}
            </Button>
          )}
        </TabsContent>

        <TabsContent value="feedback" className="mt-4 space-y-3" onFocus={ensureFeedback} onMouseDown={ensureFeedback}>
          {feedback.length === 0 && <p className="text-center text-muted-foreground py-8">No feedback yet.</p>}
          {feedback.map((f) => (
            <Card key={f.id}>
              <CardContent className="space-y-1 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase bg-muted rounded px-2 py-1">{f.category}</span>
                  <span className="text-xs font-medium uppercase bg-muted rounded px-2 py-1">{f.status}</span>
                  <span className="text-xs text-muted-foreground">{f.priority}</span>
                </div>
                <p className="font-medium">{f.title}</p>
                <p className="text-sm text-muted-foreground line-clamp-3">{f.description}</p>
                <div className="flex gap-2 flex-wrap pt-1">
                  {(["REVIEWING", "PLANNED", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const).map((s) => (
                    <Button key={s} size="sm" variant="outline" className="min-h-[44px]" onClick={() => updateFeedback(f.id, s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="audit" className="mt-4 space-y-2" onFocus={ensureAudit} onMouseDown={ensureAudit}>
          {audit.length === 0 && <p className="text-center text-muted-foreground py-8">No audit records.</p>}
          {audit.map((a) => (
            <Card key={a._id}>
              <CardContent className="pt-3 text-sm">
                <p className="font-mono text-xs break-all">{a.action} · {a.targetType ?? "-"} · {a.targetId ?? "-"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(a.createdAt).toLocaleString()}
                  {a.source ? ` · ${a.source === "moderation" ? "moderation decision" : "privileged action"}` : ""}
                  {a.actorId ? ` · actor ${a.actorId}` : a.moderatorId ? ` · moderator ${a.moderatorId}` : ""}
                </p>
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

function ReportNotesForm({ onSubmit }: { onSubmit: (notes: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const noteId = useId();
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="min-h-[44px] rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Add staff note (never shown to students)
      </button>
    );
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (notes.trim()) {
          onSubmit(notes.trim());
          setNotes("");
          setOpen(false);
        }
      }}
    >
      <label htmlFor={noteId} className="sr-only">Staff-only moderation note</label>
      <Input
        id={noteId}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Staff-only note…"
        maxLength={2000}
        className="min-h-[44px]"
      />
      <Button type="submit" size="sm" className="min-h-[44px]" disabled={!notes.trim()}>
        Save note
      </Button>
    </form>
  );
}

/** Staff content-moderation workspace: live/removed posts & comments with search, remove/restore, and paging. */
function AdminModerate({ onNotice }: { onNotice: (msg: string) => void }) {
  const [kind, setKind] = useState<"posts" | "comments">("posts");
  const [items, setItems] = useState<Array<{ _id: string; content?: string | null; createdAt: string; deletedAt?: string | null }>>([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadItems = useCallback(async (cursorValue: string | null, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (debounced) params.set("search", debounced);
      if (showDeleted) params.set("deleted", "true");
      if (cursorValue) params.set("cursor", cursorValue);
      const res = await fetch(`/api/admin/${kind}?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load");
      const list = (kind === "posts" ? data.posts : data.comments) ?? [];
      setItems((prev) => (append ? [...prev, ...list] : list));
      setHasMore(list.length === 20);
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [kind, debounced, showDeleted, onNotice]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filter-scoped server-state sync; refresh shared with load-more
    void loadItems(null, false);
  }, [loadItems]);

  const act = async (id: string, action: "remove" | "restore") => {
    if (!window.confirm(`${action === "remove" ? "Remove" : "Restore"} this ${kind === "posts" ? "post" : "comment"}? Logged to audit.`)) return;
    const key = kind === "posts" ? "postId" : "commentId";
    const res = await fetch(`/api/admin/${kind}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: id, action }),
    });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i._id !== id));
      onNotice(`${action === "remove" ? "Removed" : "Restored"}. Logged.`);
    } else {
      onNotice("Action failed (check permissions).");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5" role="group" aria-label="Content kind">
          {(["posts", "comments"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`min-h-[44px] rounded-xl px-4 text-sm font-medium capitalize ${kind === k ? "bg-primary text-primary-foreground" : "border border-border"}`}
            >
              {k}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowDeleted((v) => !v)}
          aria-pressed={showDeleted}
          className={`min-h-[44px] rounded-xl px-4 text-sm font-medium ${showDeleted ? "bg-primary/10 text-foreground" : "border border-border text-muted-foreground"}`}
        >
          {showDeleted ? "Showing removed" : "Showing live"}
        </button>
      </div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Search ${kind}…`}
        aria-label={`Search ${kind}`}
        className="min-h-[44px]"
      />
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        items.map((i) => (
          <Card key={i._id}>
            <CardContent className="space-y-1.5 pt-4">
              <p className="whitespace-pre-wrap break-words text-sm">{i.content || <span className="text-muted-foreground">(no text)</span>}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(i.createdAt).toLocaleString()}
                {i.deletedAt ? " · removed" : ""}
              </p>
              <div className="flex gap-2">
                {showDeleted ? (
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => act(i._id, "restore")}>
                    Restore
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => act(i._id, "remove")}>
                    Remove
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
      {hasMore && items.length > 0 && (
        <Button variant="outline" className="min-h-[48px] w-full" onClick={() => void loadItems(items[items.length - 1]?.createdAt ?? null, true)} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
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
