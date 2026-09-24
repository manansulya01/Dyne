"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, CalendarDays } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { EventCard } from "@/components/cards/EntityCards";

export function BuildingView({ id }: { id: string }) {
  const [data, setData] = useState<{ building: Record<string, unknown>; events: Array<Record<string, unknown>> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/campus/buildings/${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Building not found");
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Building not found");
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <div className="mx-auto max-w-3xl p-4"><div className="dyne-card"><ErrorState title="Building not found" description={error} onRetry={() => window.location.reload()} /></div></div>;
  if (!data) return <div className="mx-auto max-w-3xl space-y-3 p-4"><ListSkeleton rows={3} /></div>;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-4">
      <Link href="/campus" className="text-sm font-medium text-primary">← Campus guide</Link>
      <div className="dyne-card mt-3 p-5 sm:p-6">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <MapPin className="h-6 w-6 text-primary" aria-hidden="true" />
          {String(data.building.name)}
        </h1>
        {data.building.description ? <p className="mt-2 leading-relaxed text-muted-foreground">{String(data.building.description)}</p> : null}
      </div>

      <section aria-label="Events at this location" className="mt-5">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold"><CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" /> Events here</h2>
        {data.events.length === 0 ? (
          <div className="dyne-card"><EmptyState icon={CalendarDays} title="No events at this location yet" description="When organizers attach this building to an event, it will be listed here automatically." /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.events.map((e) => (
              <EventCard
                key={String(e.id)}
                event={{
                  id: String(e.id),
                  title: String(e.title),
                  description: (e.description as string | null) ?? null,
                  image_url: ((e.image_url ?? null) as string | null),
                  start_time: String(e.start_time),
                  end_time: String(e.end_time),
                  attendee_count: Number(e.attendee_count ?? 0),
                  location_name: String(data.building.name),
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
