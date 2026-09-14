"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/browser";
import { formatRelativeTime } from "@/lib/utils";
import { Bell, CheckCheck } from "lucide-react";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  actor: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
}

export function NotificationsPageClient() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications?limit=30");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load notifications");
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial notifications load only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime: prepend new notifications addressed to us.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      channel = supabase
        .channel(`notifications-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
          (payload) => {
            const n = payload.new as NotificationItem;
            setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
            setUnreadCount((c) => c + 1);
          }
        )
        .subscribe();
    })();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const markRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  };

  const targetHref = (n: NotificationItem): string => {
    const postId = n.data?.post_id;
    if (typeof postId === "string") return "/feed";
    if (n.type === "follow" && n.actor) return `/profile/${n.actor.username}`;
    if (n.type === "message") return "/chat";
    return "/feed";
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6" aria-hidden="true" />
          Notifications
          {unreadCount > 0 && (
            <span className="text-sm font-medium bg-primary text-primary-foreground rounded-full px-2 py-0.5" aria-label={`${unreadCount} unread`}>
              {unreadCount}
            </span>
          )}
        </h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="min-h-[44px]" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4 mr-1" aria-hidden="true" />
            Mark all read
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12" role="status" aria-label="Loading notifications">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive text-center">{error}</p>}

      {!isLoading && !error && notifications.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-50" aria-hidden="true" />
            <p className="font-medium">You&apos;re all caught up</p>
            <p className="text-sm mt-1">Likes, follows, comments, and messages will appear here.</p>
          </CardContent>
        </Card>
      )}

      <ul className="space-y-2">
        {notifications.map((n) => (
          <li key={n.id}>
            <Card className={n.read_at ? "opacity-75" : ""}>
              <CardContent className="pt-4">
                <div className="flex gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={n.actor?.avatar_url || ""} alt="" />
                    <AvatarFallback name={n.actor?.display_name || n.actor?.username || n.title} />
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <Link href={targetHref(n)} onClick={() => !n.read_at && markRead(n.id)} className="block min-h-[44px]">
                      <p className="text-sm">
                        <span className="font-medium">{n.actor?.display_name || n.actor?.username || n.title}</span>
                        {n.message && <span className="text-muted-foreground"> {n.message}</span>}
                      </p>
                      <time className="text-xs text-muted-foreground">{formatRelativeTime(n.created_at)}</time>
                    </Link>
                  </div>
                  {!n.read_at && (
                    <Button variant="ghost" size="sm" className="min-h-[44px] shrink-0" onClick={() => markRead(n.id)}>
                      Mark read
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
