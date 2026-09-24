"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { usePolling, POLL_INTERVALS } from "@/hooks/usePolling";
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

type Category = "all" | "social" | "messages" | "communities" | "events" | "campus" | "system";

function categoryOf(n: NotificationItem): Exclude<Category, "all"> {
  switch (n.type) {
    case "follow":
    case "like":
    case "comment":
    case "mention":
      return "social";
    case "message":
      return "messages";
    case "community_join":
      return "communities";
    case "event_reminder":
    case "event_rsvp":
      return "events";
    case "moderation_action":
      return "system";
    default:
      return "campus";
  }
}

export function NotificationsPageClient() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<Category>("all");

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications?limit=30");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load notifications");
      setNotifications(data.notifications ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();
  }, [fetchNotifications]);

  const mergeNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=30");
      const data = await res.json();
      if (!res.ok) return;
      const incoming = (data.notifications ?? []) as NotificationItem[];
      setNotifications((prev) => {
        const known = new Map(prev.map((n) => [n.id, n]));
        for (const n of incoming) {
          const existing = known.get(n.id);
          known.set(n.id, existing?.read_at ? { ...n, read_at: existing.read_at } : n);
        }
        return [...known.values()].sort((a, b) =>
          a.created_at < b.created_at ? 1 : -1
        );
      });
    } catch {
      /* transient failures resolve on the next tick */
    }
  }, []);

  usePolling(mergeNotifications, POLL_INTERVALS.notifications);

  const markRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
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
    if (n.type === "event_reminder" || n.type === "event_rsvp") {
      const eventId = n.data?.event_id;
      if (typeof eventId === "string") return `/events/${eventId}`;
      return "/events";
    }
    if (n.type === "community_join") return "/communities";
    return "/feed";
  };

  const visible = useMemo(
    () => (cat === "all" ? notifications : notifications.filter((n) => categoryOf(n) === cat)),
    [notifications, cat]
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-3 pb-6 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
          <Bell className="h-6 w-6" aria-hidden="true" />
          Notifications
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-sm font-medium text-primary-foreground" aria-label={`${unreadCount} unread`}>
              {unreadCount}
            </span>
          )}
        </h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="min-h-[44px] rounded-xl" onClick={markAllRead}>
            <CheckCheck className="mr-1 h-4 w-4" aria-hidden="true" />
            Mark all read
          </Button>
        )}
      </div>

      <SegmentedControl<Category>
        label="Notification category"
        value={cat}
        onChange={setCat}
        options={[
          { value: "all", label: "All" },
          { value: "social", label: "Social" },
          { value: "messages", label: "Messages" },
          { value: "communities", label: "Communities" },
          { value: "events", label: "Events" },
          { value: "campus", label: "Campus" },
          { value: "system", label: "System" },
        ]}
      />

      {isLoading && <ListSkeleton rows={4} />}
      {error && <div className="dyne-card"><ErrorState title="Couldn't load notifications" description={error} onRetry={fetchNotifications} /></div>}

      {!isLoading && !error && visible.length === 0 && (
        <div className="dyne-card">
          <EmptyState
            icon={Bell}
            title={cat === "all" ? "You're all caught up" : `No ${cat} notifications`}
            description="Likes, follows, comments, messages, community activity, events, and system updates will appear here with contextual links."
          />
        </div>
      )}

      <ul className="space-y-2">
        {visible.map((n) => (
          <li key={n.id}>
            <Card className={`dyne-card ${n.read_at ? "opacity-75" : "border-l-4 border-l-primary"}`}>
              <CardContent className="pt-4">
                <div className="flex gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={n.actor?.avatar_url || ""} alt="" />
                    <AvatarFallback name={n.actor?.display_name || n.actor?.username || n.title} />
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <Link href={targetHref(n)} onClick={() => !n.read_at && markRead(n.id)} className="block min-h-[44px]">
                      <p className="text-sm">
                        <span className="font-medium">{n.actor?.display_name || n.actor?.username || n.title}</span>
                        {n.message && <span className="text-muted-foreground"> {n.message}</span>}
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{categoryOf(n)}</p>
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
