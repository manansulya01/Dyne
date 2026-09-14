"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
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
}

const EMPTY: Results = { people: [], posts: [], communities: [], events: [], buildings: [], clubs: [], videos: [] };

export function SearchPageClient() {
  const [query, setQuery] = useState("");
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
    results.events.length + results.buildings.length + results.clubs.length + results.videos.length;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <label htmlFor="global-search" className="sr-only">Search Dyne</label>
        <Input
          id="global-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, posts, communities, events…"
          className="pl-10 min-h-[48px] text-base"
          autoComplete="off"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {!searched && !isLoading && (
        <p className="text-center text-muted-foreground py-12">Type at least 2 characters to search across Dyne.</p>
      )}

      {searched && !isLoading && total === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="font-medium">No results for “{query.trim()}”</p>
          <p className="text-sm mt-1">Try a different name or keyword.</p>
        </div>
      )}

      {results.people.length > 0 && (
        <Section title="People">
          {results.people.map((p) => (
            <Link key={p.id} href={`/profile/${p.username}`} className="flex items-center gap-3 rounded-lg px-2 py-2 min-h-[48px] hover:bg-accent">
              <Avatar className="h-9 w-9">
                <AvatarImage src={p.avatar_url || ""} alt="" />
                <AvatarFallback name={p.display_name || p.username} />
              </Avatar>
              <span>
                <span className="block text-sm font-medium">{p.display_name || p.username}</span>
                <span className="block text-xs text-muted-foreground">@{p.username}</span>
              </span>
            </Link>
          ))}
        </Section>
      )}

      {results.posts.length > 0 && (
        <Section title="Posts">
          {results.posts.map((p) => (
            <Link key={p.id} href="/feed" className="block rounded-lg px-2 py-2 hover:bg-accent">
              <span className="block text-sm font-medium">{p.author?.display_name || p.author?.username || "Unknown"}</span>
              <span className="block text-sm text-muted-foreground line-clamp-2">{p.content}</span>
              <span className="block text-xs text-muted-foreground mt-1">{formatRelativeTime(p.created_at)}</span>
            </Link>
          ))}
        </Section>
      )}

      {results.communities.length > 0 && (
        <Section title="Communities">
          {results.communities.map((c) => (
            <Link key={c.id} href={`/communities/${c.slug}`} className="block rounded-lg px-2 py-2 min-h-[48px] hover:bg-accent">
              <span className="block text-sm font-medium">{c.name}</span>
              {c.description && <span className="block text-sm text-muted-foreground line-clamp-1">{c.description}</span>}
            </Link>
          ))}
        </Section>
      )}

      {results.events.length > 0 && (
        <Section title="Events">
          {results.events.map((e) => (
            <Link key={e.id} href="/events" className="block rounded-lg px-2 py-2 min-h-[48px] hover:bg-accent">
              <span className="block text-sm font-medium">{e.title}</span>
              <span className="block text-xs text-muted-foreground">{formatRelativeTime(e.start_time)}</span>
            </Link>
          ))}
        </Section>
      )}

      {(results.buildings.length > 0 || results.clubs.length > 0) && (
        <Section title="Campus">
          {results.buildings.map((b) => (
            <Link key={b.id} href="/campus" className="block rounded-lg px-2 py-2 min-h-[44px] hover:bg-accent">
              <span className="block text-sm font-medium">{b.name}</span>
            </Link>
          ))}
          {results.clubs.map((c) => (
            <Link key={c.id} href="/campus" className="block rounded-lg px-2 py-2 min-h-[44px] hover:bg-accent">
              <span className="block text-sm font-medium">{c.name}</span>
              {c.category && <span className="block text-xs text-muted-foreground">{c.category}</span>}
            </Link>
          ))}
        </Section>
      )}

      {results.videos.length > 0 && (
        <Section title="Videos">
          {results.videos.map((v) => (
            <Link key={v.id} href={`/watch/${v.id}`} className="block rounded-lg px-2 py-2 min-h-[44px] hover:bg-accent">
              <span className="block text-sm font-medium">{v.title}</span>
              <span className="block text-xs text-muted-foreground">{v.view_count} views</span>
            </Link>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</h2>
        <div className="divide-y">{children}</div>
      </CardContent>
    </Card>
  );
}
