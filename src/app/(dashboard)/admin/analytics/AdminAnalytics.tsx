"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { ArrowLeft } from "lucide-react";

/** Platform analytics from real MongoDB counts only. */

export function AdminAnalytics({ role }: { role: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/analytics");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Could not load analytics.");
          return;
        }
        setData(json);
      } catch {
        if (!cancelled) setError("Could not load analytics.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = (data?.stats ?? null) as Record<string, number> | null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
        <Link href="/admin">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Admin console
        </Link>
      </Button>
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Platform analytics</h1>
      <p className="text-sm text-muted-foreground">
        Every figure below is a live MongoDB count. Nothing is estimated or sampled.
      </p>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {error}
        </p>
      )}

      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(stats).map(([key, value]) => (
            <Card key={key}>
              <CardContent className="pt-4">
                <p className="text-xs font-medium capitalize text-muted-foreground">
                  {key.replace(/([A-Z])/g, " $1").toLowerCase()}
                </p>
                <p className="mt-0.5 text-2xl font-extrabold tabular-nums">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data?.roleBreakdown ? (
        <Card>
          <CardContent className="pt-4">
            <h2 className="font-semibold">Role distribution</h2>
            <ul className="mt-2 grid gap-2 sm:grid-cols-3">
              {(data.roleBreakdown as Array<{ _id: string; count: number }>).map((r) => (
                <li key={r._id} className="rounded-lg bg-muted/60 p-2.5 text-sm capitalize">
                  {r._id}: <span className="font-bold tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Signed in as <span className="font-medium capitalize">{role.replace("_", " ")}</span>. Teachers
        additionally see their own assignment breakdown; the full user list and role management are
        admin-only.
      </p>
    </div>
  );
}
