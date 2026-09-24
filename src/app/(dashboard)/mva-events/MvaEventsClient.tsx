"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EventCard } from "@/components/cards/EntityCards";

interface Ev {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  start_time: string;
  end_time: string;
  attendee_count?: number;
  location?: { name?: string } | null;
}

export function MvaEventsClient() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/events?limit=50");
        const json = await res.json();
        if (!cancelled && res.ok) setEvents(json.events ?? []);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const upcoming = events.filter((e) => new Date(e.start_time) >= new Date());
  const featured = upcoming.slice(0, 1);
  const rest = upcoming.slice(1);

  if (loading) return <div className="mx-auto max-w-4xl space-y-3 p-4"><ListSkeleton rows={4} /></div>;

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pb-6 pt-4 sm:px-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Official campus lineup</p>
      <h1 className="mt-1 text-xl font-extrabold tracking-tight sm:text-3xl">Upcoming MVA events</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The same real Events system — fests, workshops, matches, and meetups — curated for what&apos;s next on campus. Dates here are entered by organizers, never invented.
      </p>

      <div className="mt-4">
        <SegmentedControl label="Event filter" value={cat} onChange={setCat} options={[
          { value: "all", label: "All upcoming" },
          { value: "featured", label: "Featured" },
        ]} />
      </div>

      {upcoming.length === 0 ? (
        <div className="dyne-card mt-4">
          <EmptyState icon={CalendarDays} title="No upcoming MVA events yet" description="When organizers publish events, the next campus gathering will be featured here. Create one from the events page if you have something to share." actionLabel="Browse all events" onAction={() => (window.location.href = "/events")} />
        </div>
      ) : (
        <>
          {cat !== "featured" && featured.length > 0 && (
            <section aria-label="Featured event" className="mt-4">
              {featured.map((e) => (
                <Link key={e.id} href={`/events/${e.id}`} className="dyne-card dyne-card-hover block overflow-hidden">
                  {e.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.image_url} alt="" className="h-52 w-full object-cover sm:h-72" loading="lazy" />
                  )}
                  <span className="block p-5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary"><Star className="h-3.5 w-3.5" /> Featured</span>
                    <span className="mt-1 block text-xl font-extrabold tracking-tight">{e.title}</span>
                    {e.description && <span className="dyne-line-2 mt-1 block text-sm text-muted-foreground">{e.description}</span>}
                  </span>
                </Link>
              ))}
            </section>
          )}
          {(cat === "all" ? rest : featured).length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(cat === "all" ? rest : featured).map((e) => (
                <EventCard key={e.id} event={{ id: e.id, title: e.title, description: e.description, image_url: e.image_url, start_time: e.start_time, end_time: e.end_time, attendee_count: e.attendee_count ?? 0, location_name: e.location?.name ?? null }} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
