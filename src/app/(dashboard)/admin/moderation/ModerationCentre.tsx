"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { cn, formatDate } from "@/lib/utils";
import { ArrowLeft, Bot, ShieldCheck, ShieldAlert } from "lucide-react";

/**
 * Unified moderation centre.
 *
 * Tabs: pending / flagged / approved / rejected, filterable by content type.
 * Group-message rows show only a short excerpt and verdict metadata — the full
 * private content is never sent to a browser.
 */

interface QueueItem {
  id: string;
  content_type: string;
  content_id: string;
  status: string;
  reason: string | null;
  score: number | null;
  source: string;
  provider: string | null;
  categories: string[];
  media_analyzed: boolean;
  needs_manual_review: boolean;
  excerpt: string | null;
  author: { username: string; display_name: string | null } | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  override_reason: string | null;
  created_at: string;
}

interface QueuePayload {
  items: QueueItem[];
  counts: { pending: number; flagged: number; approved: number; rejected: number; total: number };
  contentTypes: string[];
  provider: {
    configured: boolean;
    provider: string | null;
    capabilities: string[];
    supportsMedia: boolean;
    mode: string;
    note: string;
  };
  cursor: string | null;
  hasMore: boolean;
}

const TABS = ["pending", "flagged", "approved", "rejected"] as const;

export function ModerationCentre() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("pending");
  const [contentType, setContentType] = useState("");
  const [data, setData] = useState<QueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: tab, limit: "30" });
      if (contentType) params.set("contentType", contentType);
      const res = await fetch(`/api/moderation/queue?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setNotice(json.error ?? "Could not load the moderation queue.");
        return;
      }
      setData(json);
    } catch {
      setNotice("Could not load the moderation queue.");
    } finally {
      setLoading(false);
    }
  }, [tab, contentType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tab-scoped server-state sync; refresh shared with decisions
    void load();
  }, [load]);

  const decide = async (id: string, action: "approve" | "reject" | "dismiss") => {
    const reason = action === "reject" ? window.prompt("Reason (optional):") ?? "" : undefined;
    const res = await fetch(`/api/moderation/queue?id=${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setNotice(json?.error ?? "Could not apply the decision.");
      return;
    }
    setNotice(`Decision "${action}" applied and audited.`);
    await load();
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
        <Link href="/admin">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Admin console
        </Link>
      </Button>

      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Moderation centre</h1>

      {/* AI provider status — no keys, no prompts, no internal endpoints */}
      {data && (
        <Card>
          <CardContent className="pt-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Bot className="h-4 w-4" aria-hidden="true" /> AI moderation status
            </h2>
            <p className="mt-1 text-sm">
              <span
                className={cn(
                  "font-semibold",
                  data.provider.configured
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                )}
              >
                {data.provider.configured ? "Configured" : "Not configured"}
              </span>{" "}
              · mode: {data.provider.mode}
              {data.provider.provider ? ` · provider: ${data.provider.provider}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{data.provider.note}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Categories checked by the provider:{" "}
              {data.provider.capabilities.length > 0 ? data.provider.capabilities.join(", ") : "none"}
              {data.provider.supportsMedia ? " · media analysis enabled" : " · media analysis disabled"}
            </p>
          </CardContent>
        </Card>
      )}

      {notice && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
          {notice}
        </p>
      )}

      {data && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Moderation status">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "min-h-[44px] rounded-xl px-4 text-sm font-medium capitalize",
                tab === t ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
              )}
            >
              {t} ({data.counts[t]})
            </button>
          ))}
        </div>
      )}

      {data && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Content type filter">
          {["", ...data.contentTypes].map((t) => (
            <button
              key={t || "all"}
              onClick={() => setContentType(t)}
              aria-pressed={contentType === t}
              className={cn(
                "min-h-[44px] rounded-full px-3 text-xs font-medium",
                contentType === t
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground"
              )}
            >
              {t || "All types"}
            </button>
          ))}
        </div>
      )}

      {loading && !data && (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          Loading queue…
        </p>
      )}

      {data && data.items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nothing in the {tab} queue.
        </p>
      )}

      <ul className="space-y-2">
        {(data?.items ?? []).map((item) => (
          <li key={item.id}>
            <Card>
              <CardContent className="pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase">
                    {item.content_type}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                      item.status === "approved"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : item.status === "rejected"
                          ? "bg-red-500/10 text-red-600 dark:text-red-400"
                          : item.status === "flagged"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                    )}
                  >
                    {item.status}
                  </span>
                  {item.score !== null && (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      confidence {(item.score * 100).toFixed(0)}%
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    source: {item.source}
                    {item.provider ? ` · ${item.provider}` : ""}
                  </span>
                  {item.media_analyzed === false && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400">
                      media not machine-reviewed
                    </span>
                  )}
                  <time className="ml-auto text-[11px] text-muted-foreground">
                    {formatDate(item.created_at)}
                  </time>
                </div>

                <p className="mt-2 text-sm">
                  {item.excerpt ?? <span className="text-muted-foreground">(no excerpt stored)</span>}
                </p>
                {item.reason && <p className="mt-1 text-xs text-muted-foreground">Reason: {item.reason}</p>}
                {item.categories.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Categories: {item.categories.join(", ")}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Author:{" "}
                  {item.author ? `@${item.author.username}` : "unknown"}
                  {item.content_type === "message" ? " · group message (excerpt only)" : ""}
                </p>
                {item.reviewed_at && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Reviewed {formatDate(item.reviewed_at)}
                    {item.override_reason ? ` — ${item.override_reason}` : ""}
                  </p>
                )}

                {!item.reviewed_at && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" className="min-h-[44px]" onClick={() => decide(item.id, "approve")}>
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-[44px]"
                      onClick={() => decide(item.id, "reject")}
                    >
                      <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-[44px]"
                      onClick={() => decide(item.id, "dismiss")}
                    >
                      Dismiss (keep in queue)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {data?.hasMore && data.items.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          More items exist — refine the filters to narrow the queue.
        </p>
      )}
    </div>
  );
}
