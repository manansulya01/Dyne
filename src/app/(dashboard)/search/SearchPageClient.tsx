"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { formatRelativeTime } from "@/lib/utils";
import { Search as SearchIcon, Loader2 } from "lucide-react";

interface Results {
  people: Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null; role: string }>;
  posts: Array<{ id: string; content: string | null; created_at: string; author: { username: string; display_name: string | null; avatar_url: string | null } | null }>;
  communities: Array<{ id: string; slug: string; name: string; description: string | null }>;
  events: Array<{ id: string; title: string; start_time: string }>;
  buildings: Array<{ id: string; name: string; description: string | null }>;
  clubs: Array<{ id: string; name: string; category: string | null }>;
  videos: Array<{ id: string; title: string; view_count: number }>;
  blogs: Array<{ id: string; slug: string; title: string; excerpt: string | null; category: string | null }>;
}

const EMPTY: Results = { people: [], posts: [], communities: [], events: [], buildings: [], clubs: [], videos: [], blogs: [] };

type Tab = "all" | "people" | "posts" | "communities" | "events" | "campus" | "videos" | "blogs";

export function SearchPageClient() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [tab, setTab] = useState<Tab>("all");
  const [results, setResults] = useState<Results>(EMPTY);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(EMPTY);
      setSearched(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults({ ...EMPTY, ...data });
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(query), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, runSearch]);

  const total =
    results.people.length + results.posts.length + results.communities.length +
    results.events.length + results.buildings.length + results.clubs.length +
    results.videos.length + results.blogs.length;

  const show = (t: Tab) => tab === "all" || tab === t;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-6 pt-4 sm:px-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Search</h1>
        <p className="text-sm text-muted-foreground">People, posts, communities, videos, events, clubs, buildings, and stories.</p>
      </div>
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <label htmlFor="global-search" className="sr-only">Search Dyne</label>
        <Input
          id="global-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, posts, communities, events…"
          className="min-h-[48px] rounded-xl pl-10 text-base"
          autoComplete="off"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      {searched && (
        <SegmentedControl<Tab>
          label="Result type"
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: "All" },
            { value: "people", label: "People" },
            { value: "posts", label: "Posts" },
            { value: "communities", label: "Communities" },
            { value: "events", label: "Events" },
            { value: "campus", label: "Campus" },
            { value: "videos", label: "Videos" },
            { value: "blogs", label: "Stories" },
          ]}
        />
      )}

      {error && <div className="dyne-card"><ErrorState title="Search failed" description={error} onRetry={() => runSearch(query)} /></div>}
      {isLoading && <ListSkeleton rows={4} />}

      {!searched && !isLoading && (
        <div className="dyne-card">
          <EmptyState icon={SearchIcon} title="Search the entire campus network" description="Type at least 2 characters. Try a classmate's name, a club, an event, or a keyword like “robotics”." />
        </div>
      )}

      {searched && !isLoading && total === 0 && (
        <div className="dyne-card">
          <EmptyState icon={SearchIcon} title={`No results for “${query.trim()}”`} description="Try a different name or keyword. Searches cover people, posts, communities, events, clubs, buildings, videos, and stories." />
        </div>
      )}

      {show("people") && results.people.length > 0 && (
        <Section title="People">
          {results.people.map((p) => (
            <Link key={p.id} href={`/profile/${p.username}`} className="flex min-h-[52px] items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted">
              <Avatar className="h-9 w-9">
                <AvatarImage src={p.avatar_url || ""} alt="" />
                <AvatarFallback name={p.display_name || p.username} />
              </Avatar>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{p.display_name || p.username}</span>
                <span className="block truncate text-xs text-muted-foreground">@{p.username}</span>
              </span>
            </Link>
          ))}
        </Section>
      )}

      {show("posts") && results.posts.length > 0 && (
        <Section title="Posts">
          {results.posts.map((p) => (
            <Link key={p.id} href="/feed" className="block rounded-xl px-2 py-2 hover:bg-muted">
              <span className="block text-sm font-medium">{p.author?.display_name || p.author?.username || "Unknown"}</span>
              <span className="dyne-line-2 block text-sm text-muted-foreground">{p.content}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{formatRelativeTime(p.created_at)}</span>
            </Link>
          ))}
        </Section>
      )}

      {show("communities") && results.communities.length > 0 && (
        <Section title="Communities">
          {results.communities.map((c) => (
            <Link key={c.id} href={`/communities/${c.slug}`} className="block min-h-[48px] rounded-xl px-2 py-2 hover:bg-muted">
              <span className="block text-sm font-medium">{c.name}</span>
              {c.description && <span className="dyne-line-2 block text-sm text-muted-foreground">{c.description}</span>}
            </Link>
          ))}
        </Section>
      )}

      {show("events") && results.events.length > 0 && (
        <Section title="Events">
          {results.events.map((e) => (
            <Link key={e.id} href={`/events/${e.id}`} className="block min-h-[48px] rounded-xl px-2 py-2 hover:bg-muted">
              <span className="block text-sm font-medium">{e.title}</span>
              <span className="block text-xs text-muted-foreground">{formatRelativeTime(e.start_time)}</span>
            </Link>
          ))}
        </Section>
      )}

      {show("campus") && (results.buildings.length > 0 || results.clubs.length > 0) && (
        <Section title="Campus">
          {results.buildings.map((b) => (
            <Link key={b.id} href="/campus" className="block min-h-[44px] rounded-xl px-2 py-2 hover:bg-muted">
              <span className="block text-sm font-medium">{b.name}</span>
            </Link>
          ))}
          {results.clubs.map((c) => (
            <Link key={c.id} href="/campus" className="block min-h-[44px] rounded-xl px-2 py-2 hover:bg-muted">
              <span className="block text-sm font-medium">{c.name}</span>
              {c.category && <span className="block text-xs text-muted-foreground">{c.category}</span>}
            </Link>
          ))}
        </Section>
      )}

      {show("videos") && results.videos.length > 0 && (
        <Section title="Videos">
          {results.videos.map((v) => (
            <Link key={v.id} href={`/watch/${v.id}`} className="block min-h-[44px] rounded-xl px-2 py-2 hover:bg-muted">
              <span className="block text-sm font-medium">{v.title}</span>
              <span className="block text-xs text-muted-foreground">{v.view_count} views</span>
            </Link>
          ))}
        </Section>
      )}

      {show("blogs") && results.blogs.length > 0 && (
        <Section title="Campus stories">
          {results.blogs.map((b) => (
            <Link key={b.id} href={`/blogs/${b.slug}`} className="block min-h-[44px] rounded-xl px-2 py-2 hover:bg-muted">
              <span className="block text-sm font-medium">{b.title}</span>
              {b.excerpt && <span className="dyne-line-2 block text-sm text-muted-foreground">{b.excerpt}</span>}
            </Link>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="dyne-card">
      <CardContent className="pt-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <div className="divide-y divide-border">{children}</div>
      </CardContent>
    </Card>
  );
}
