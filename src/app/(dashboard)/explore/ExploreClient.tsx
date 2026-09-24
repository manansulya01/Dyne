"use client";

import { useState } from "react";
import Link from "next/link";
import { Compass, Users, Clapperboard, CalendarDays, Building2, Newspaper, Megaphone, Flag } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { EventCard } from "@/components/cards/EntityCards";

function Section({ icon: Icon, title, href, children, empty }: { icon: typeof Users; title: string; href: string; children?: React.ReactNode; empty?: string }) {
  return (
    <section aria-label={title} className="mt-6 first:mt-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
          <Icon className="h-5 w-5 text-primary" aria-hidden="true" /> {title}
        </h2>
        <Link href={href} className="min-h-[44px] px-2 py-2 text-sm font-medium text-primary">See all</Link>
      </div>
      {children ?? <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

export function ExploreClient(props: {
  communities: Array<Record<string, unknown>>;
  videos: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  clubs: Array<Record<string, unknown>>;
  buildings: Array<Record<string, unknown>>;
  blogs: Array<Record<string, unknown>>;
  announcements: Array<Record<string, unknown>>;
}) {
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const match = (o: Record<string, unknown>) =>
    !q || JSON.stringify(o).toLowerCase().includes(q);
  const communities = props.communities.filter(match);
  const videos = props.videos.filter(match);
  const events = props.events.filter(match);
  const clubs = props.clubs.filter(match);
  const buildings = props.buildings.filter(match);
  const blogs = props.blogs.filter(match);

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pb-6 pt-4 sm:px-4">
      <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
        <Compass className="h-6 w-6 text-primary" aria-hidden="true" /> Explore
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">People, communities, posts, videos, clubs, events, places, and stories — grouped, not dumped.</p>

      <div className="mt-4">
        <label htmlFor="explore-filter" className="sr-only">Filter explore sections</label>
        <input
          id="explore-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter what's on this page… (try “robotics”)"
          className="min-h-[48px] w-full rounded-xl border border-input bg-card px-4 text-sm"
          maxLength={100}
        />
      </div>

      {props.announcements.length > 0 && (
        <div className="dyne-card mt-4 flex items-start gap-3 border-l-4 border-l-primary p-4" role="note" aria-label="Campus announcement">
          <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{String(props.announcements[0].title)}</p>
            <p className="dyne-line-2 mt-0.5 text-sm text-muted-foreground">{String(props.announcements[0].body)}</p>
          </div>
        </div>
      )}

      <div className="mt-2">
        <Section icon={Users} title="Communities" href="/communities" empty="No communities yet — create the first one.">
          {communities.length === 0 ? <EmptyState icon={Users} title="No matching communities" description="Try a different filter, or browse all communities." /> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {communities.slice(0, 4).map((c) => (
                <Link key={String(c._id ?? c.id)} href={`/communities/${String(c.slug)}`} className="dyne-card dyne-card-hover p-4">
                  <span className="block truncate text-sm font-semibold">{String(c.name)}</span>
                  {c.description ? <span className="dyne-line-2 mt-1 block text-sm text-muted-foreground">{String(c.description)}</span> : null}
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section icon={CalendarDays} title="Upcoming events" href="/events" empty="No upcoming events.">
          {events.length === 0 ? <EmptyState icon={CalendarDays} title="Nothing upcoming" description="Check back soon — organizers publish events here." /> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {events.slice(0, 4).map((e) => {
                const id = String(e._id ?? e.id);
                return (
                  <EventCard
                    key={id}
                    event={{
                      id,
                      title: String(e.title),
                      description: (e.description as string | null) ?? null,
                      image_url: (e.imageUrl as string | null) ?? null,
                      start_time: new Date(e.startTime as string).toISOString(),
                      end_time: new Date(e.endTime as string).toISOString(),
                      attendee_count: 0,
                    }}
                  />
                );
              })}
            </div>
          )}
        </Section>

        <Section icon={Clapperboard} title="Watch" href="/watch" empty="No videos yet.">
          {videos.length === 0 ? <EmptyState icon={Clapperboard} title="No videos yet" description="Student films and highlights will appear here." /> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {videos.slice(0, 6).map((v) => (
                <Link key={String(v._id ?? v.id)} href={`/watch/${String(v._id ?? v.id)}`} className="dyne-card dyne-card-hover overflow-hidden">
                  {(v.thumbnailUrl as string | null) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={String(v.thumbnailUrl)} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex aspect-video items-center justify-center bg-muted"><Clapperboard className="h-8 w-8 text-muted-foreground" aria-hidden="true" /></span>
                  )}
                  <span className="block truncate p-2.5 text-sm font-medium">{String(v.title)}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section icon={Flag} title="Clubs" href="/campus" empty="No clubs listed yet.">
          {clubs.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {clubs.slice(0, 4).map((c) => (
                <div key={String(c._id ?? c.id)} className="dyne-card p-4">
                  <p className="truncate text-sm font-semibold">{String(c.name)}</p>
                  {c.description ? <p className="dyne-line-2 mt-1 text-sm text-muted-foreground">{String(c.description)}</p> : null}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section icon={Building2} title="Places on campus" href="/campus" empty="No buildings listed yet.">
          {buildings.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {buildings.slice(0, 4).map((b) => (
                <Link key={String(b._id ?? b.id)} href="/campus" className="dyne-card dyne-card-hover p-4">
                  <span className="block truncate text-sm font-semibold">{String(b.name)}</span>
                  {b.description ? <span className="dyne-line-2 mt-1 block text-sm text-muted-foreground">{String(b.description)}</span> : null}
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section icon={Newspaper} title="Campus stories" href="/blogs" empty="No stories published yet.">
          {blogs.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {blogs.slice(0, 4).map((b) => (
                <Link key={String(b._id ?? b.id ?? b.slug)} href={`/blogs/${String(b.slug)}`} className="dyne-card dyne-card-hover p-4">
                  <span className="block text-sm font-semibold leading-snug">{String(b.title)}</span>
                  {b.excerpt ? <span className="dyne-line-2 mt-1 block text-sm text-muted-foreground">{String(b.excerpt)}</span> : null}
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
