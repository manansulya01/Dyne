"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { ArrowLeft, Search, ShieldAlert } from "lucide-react";

/**
 * Admin user management.
 *
 * Paged and filtered server-side (never loads the whole campus). The UI
 * deliberately has NO way to read a password: actions are role change,
 * suspend/ban/restore, revoke sessions, and force a password reset.
 */

interface AdminUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  class_grade: string | null;
  account_status: "active" | "suspended" | "banned";
  suspended_until: string | null;
  banned_at: string | null;
  must_change_password: boolean;
  active_sessions: number;
  created_at: string;
}

const ROLES = ["student", "teacher", "staff", "club", "moderator", "admin", "super_admin"];
const STATUSES = ["", "active", "suspended", "banned"];

export function AdminUsersClient({
  currentRole,
  initialUsers,
  initialTotal,
  canAssignRoles,
  initialHasMore,
}: {
  currentRole: string;
  initialUsers: AdminUser[];
  initialTotal: number;
  canAssignRoles: boolean;
  initialHasMore: boolean;
}) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (offset: number, append = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "25", offset: String(offset) });
        if (debounced) params.set("search", debounced);
        if (role) params.set("role", role);
        if (status) params.set("status", status);
        const res = await fetch(`/api/admin/users?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          setNotice(data.error ?? "Could not load users.");
          return;
        }
        setTotal(data.total ?? 0);
        setHasMore(Boolean(data.hasMore));
        setUsers((prev) => {
          if (!append) return data.users ?? [];
          const seen = new Set(prev.map((u) => u.id));
          return [...prev, ...(data.users ?? []).filter((u: AdminUser) => !seen.has(u.id))];
        });
      } finally {
        setLoading(false);
      }
    },
    [debounced, role, status]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filter-scoped server-state sync; refresh shared with actions
    void load(0);
  }, [load]);

  const act = async (userId: string, action: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch(`/api/admin/users/${userId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, ...extra }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setNotice(typeof data?.error === "string" ? data.error : "Action failed (check permissions).");
      return null;
    }
    setNotice(`Action "${action}" completed and recorded in the audit log.`);
    await load(0);
    return data;
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
        <Link href="/admin">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Admin console
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Users</h1>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
          {currentRole.replace("_", " ")}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {total} user{total === 1 ? "" : "s"} match. Dyne never stores or displays plaintext or hashed
        passwords — reset a password instead.
      </p>

      {notice && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="min-w-52 flex-1">
          <label htmlFor="admin-user-search" className="sr-only">
            Search users
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              id="admin-user-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or username…"
              maxLength={100}
              className="min-h-[44px] border-0 px-0 focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="min-w-36">
          <label htmlFor="admin-user-role" className="sr-only">
            Filter by role
          </label>
          <select
            id="admin-user-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-36">
          <label htmlFor="admin-user-status" className="sr-only">
            Filter by status
          </label>
          <select
            id="admin-user-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s || "all"} value={s}>
                {s || "All statuses"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id}>
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 pt-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={u.avatar_url || ""} alt="" />
                  <AvatarFallback name={u.display_name || u.username} />
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{u.display_name || u.username}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{u.username}
                    {u.class_grade ? ` · ${u.class_grade}` : ""} · {u.active_sessions} active session
                    {u.active_sessions === 1 ? "" : "s"}
                    {u.must_change_password ? " · password change required" : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
                    u.account_status === "active"
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-red-500/10 text-red-600 dark:text-red-400"
                  )}
                >
                  {u.account_status}
                </span>
                <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-[11px] font-medium capitalize">
                  {u.role}
                </span>
                <Button asChild size="sm" variant="outline" className="min-h-[44px]">
                  <Link href={`/admin/users/${u.id}`}>Details</Link>
                </Button>
              </CardContent>

              <CardContent className="flex flex-wrap gap-2 pt-0">
                {canAssignRoles ? (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="sr-only">Change role for {u.username}</span>
                    <select
                      value={u.role}
                      onChange={async (e) => {
                        if (!window.confirm(`Change ${u.username} to ${e.target.value}? Logged.`)) {
                          return;
                        }
                        const res = await fetch("/api/admin/users", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ userId: u.id, role: e.target.value }),
                        });
                        const data = await res.json().catch(() => null);
                        setNotice(res.ok ? "Role updated and audited." : data?.error ?? "Role change failed.");
                        await load(0);
                      }}
                      className="min-h-[44px] rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {u.account_status !== "banned" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[44px]"
                    onClick={async () => {
                      if (!window.confirm(`Suspend @${u.username} for 7 days? Logged.`)) return;
                      await act(u.id, "suspend", {
                        until: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
                        reason: "7 day suspension from admin console",
                      });
                    }}
                  >
                    Suspend 7d
                  </Button>
                )}
                {u.account_status !== "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[44px]"
                    onClick={async () => {
                      if (!window.confirm(`Restore @${u.username}? Logged.`)) return;
                      if (u.account_status === "banned") await act(u.id, "unban");
                      else await act(u.id, "unsuspend");
                    }}
                  >
                    Restore
                  </Button>
                )}
                {u.account_status !== "banned" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-[44px] text-destructive"
                    onClick={async () => {
                      const reason = window.prompt("Ban reason (required):");
                      if (!reason) return;
                      await act(u.id, "ban", { reason });
                    }}
                  >
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Ban
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px]"
                  onClick={async () => {
                    if (!window.confirm(`Revoke all sessions for @${u.username}? Logged.`)) return;
                    await act(u.id, "revoke_sessions");
                  }}
                >
                  Revoke sessions
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px]"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Force a password reset for @${u.username}? Their sessions will be revoked and a single-use reset link will be sent to their registered email address.`
                      )
                    )
                      return;
                    const data = await act(u.id, "force_password_reset");
                    setNotice(
                      data?.success
                        ? `Reset link sent to @${u.username}'s email address. It expires ${new Date(
                            data.expiresAt as string
                          ).toLocaleString()} and can only be used once.`
                        : (data?.error ?? "Could not start the password reset")
                    );
                  }}
                >
                  Force password reset
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {users.length === 0 && !loading && (
        <p className="py-8 text-center text-sm text-muted-foreground">No users match these filters.</p>
      )}

      {hasMore && users.length > 0 && (
        <Button
          variant="outline"
          className="min-h-[48px] w-full"
          disabled={loading}
          onClick={() => void load(users.length, true)}
        >
          {loading ? "Loading…" : "Load more users"}
        </Button>
      )}
    </div>
  );
}
