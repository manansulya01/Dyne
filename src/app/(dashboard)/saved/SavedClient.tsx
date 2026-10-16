"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, FileText, Download } from "lucide-react";
import { PostCard } from "../feed/Feed";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PostCardSkeleton } from "@/components/ui/Skeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { formatRelativeTime, formatBytes } from "@/lib/utils";
import type { PostWithRelations } from "@/types";

interface SavedMaterial {
  id: string;
  title: string;
  subject: string | null;
  material_type: string;
  file_name: string;
  size: number;
  download_url: string;
  created_at: string;
}

export function SavedClient({ currentUserId }: { currentUserId: string | null }) {
  const [tab, setTab] = useState<"posts" | "study">("posts");
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [materials, setMaterials] = useState<SavedMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: "posts" | "study") => {
    setLoading(true);
    setError(null);
    try {
      const url = t === "posts" ? "/api/saved-posts?limit=30" : "/api/study-materials?saved=true&limit=30";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load saved items");
      if (t === "posts") setPosts(data.posts ?? []);
      else setMaterials(data.materials ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load saved items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tab-scoped server-state sync; refresh path shared with retry
    void load(tab);
  }, [tab, load]);

  const switchTab = (t: "posts" | "study") => setTab(t);

  const removePost = (id: string) => setPosts((prev) => prev.filter((p) => p.id !== id));

  return (
    <div className="mx-auto w-full max-w-2xl px-3 pb-6 pt-4 sm:px-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Saved</h1>
          <p className="text-sm text-muted-foreground">Everything you bookmarked — posts and study materials.</p>
        </div>
        <SegmentedControl<"posts" | "study">
          label="Saved filter"
          value={tab}
          onChange={switchTab}
          options={[
            { value: "posts", label: "Posts", icon: <Bookmark className="h-4 w-4" aria-hidden="true" /> },
            { value: "study", label: "Study", icon: <FileText className="h-4 w-4" aria-hidden="true" /> },
          ]}
        />
      </div>

      {loading ? (
        <div className="space-y-3" aria-label="Loading saved items">
          <PostCardSkeleton />
          <PostCardSkeleton />
        </div>
      ) : error ? (
        <div className="dyne-card">
          <ErrorState title="Couldn't load saved items" description={error} onRetry={() => void load(tab)} />
        </div>
      ) : tab === "posts" ? (
        <div className="space-y-3" role="feed" aria-label="Saved posts">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} currentUserId={currentUserId} onDeleted={removePost} />
          ))}
          {posts.length === 0 && (
            <div className="dyne-card">
              <EmptyState
                icon={Bookmark}
                title="Nothing saved yet"
                description="Tap the bookmark on any post to keep it here for later."
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3" aria-label="Saved study materials">
          {materials.map((m) => (
            <div key={m.id} className="dyne-card flex items-center gap-3 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{m.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[m.subject, m.material_type, formatBytes(m.size)].filter(Boolean).join(" · ")} · saved {formatRelativeTime(m.created_at)}
                </span>
              </span>
              <a
                href={m.download_url}
                download={m.file_name}
                aria-label={`Download ${m.title}`}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Download className="h-5 w-5" aria-hidden="true" />
              </a>
            </div>
          ))}
          {materials.length === 0 && (
            <div className="dyne-card">
              <EmptyState
                icon={FileText}
                title="No saved study materials"
                description="Save materials from the study hub to find them here."
              />
            </div>
          )}
        </div>
      )}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        {tab === "posts" ? (
          <Link href="/feed" className="text-primary hover:underline">Back to feed</Link>
        ) : (
          <Link href="/study-materials" className="text-primary hover:underline">Back to study materials</Link>
        )}
      </p>
    </div>
  );
}
