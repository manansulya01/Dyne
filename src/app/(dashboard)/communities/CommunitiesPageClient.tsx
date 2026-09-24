"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { Search, Users, Plus, Lock } from "lucide-react";

interface CommunityData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  owner_id: string;
  is_private: boolean;
  created_at: string;
  member_count: number;
  is_member: boolean;
  is_owner: boolean;
  member_role: string;
}

interface CommunitiesPageClientProps {
  currentUserId: string | null;
}

export function CommunitiesPageClient({ currentUserId }: CommunitiesPageClientProps) {
  const router = useRouter();
  const [communities, setCommunities] = useState<CommunityData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sort, setSort] = useState<"latest" | "popular" | "discussed">("latest");

  const fetchCommunities = useCallback(async (isLoadMore = false) => {
    if (isLoadMore && (!hasMore || isLoading)) return;
    setIsLoading(true);

    try {
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) params.set("cursor", cursor);
      if (debouncedSearch) params.set("search", debouncedSearch);

      const response = await fetch(`/api/communities?${params.toString()}`);
      const data = await response.json();

      if (data.communities) {
        if (isLoadMore) {
          setCommunities(prev => [...prev, ...data.communities]);
        } else {
          setCommunities(data.communities);
        }
        setCursor(data.cursor);
        setHasMore(data.hasMore);
      }
    } catch (error) {
      console.error("Failed to fetch communities:", error);
    } finally {
      setIsLoading(false);
    }
  }, [cursor, debouncedSearch, hasMore, isLoading]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCursor(null);
      setCommunities([]);
      setHasMore(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCommunities();
  }, [debouncedSearch]);

  const handleCreateCommunity = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      const response = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") || ""),
          slug: String(formData.get("slug") || "").toLowerCase().trim(),
          description: String(formData.get("description") || "") || undefined,
          isPrivate: formData.get("isPrivate") === "on",
        }),
      });

      const result = await response.json();

      if (result.community) {
        setCommunities([result.community, ...communities]);
        setShowCreateModal(false);
        e.currentTarget.reset();
      } else {
        alert(result.error?._form?.[0] || "Failed to create community");
      }
    } catch (error) {
      alert("Failed to create community");
    }
  };

  // Honest deterministic sorts (client-side over the loaded page).
  const sorted = [...communities].sort((a, b) => {
    if (sort === "popular" || sort === "discussed") return b.member_count - a.member_count;
    return +new Date(b.created_at) - +new Date(a.created_at);
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Communities</h1>
          <p className="text-sm text-muted-foreground">Every class, club, and interest has a home.</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="min-h-[48px] rounded-xl">
          <Plus className="mr-2 h-4 w-4" />
          Create Community
        </Button>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search communities..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="min-h-[48px] rounded-xl pl-10"
          aria-label="Search communities"
        />
      </div>

      <div className="mb-4">
        <SegmentedControl
          label="Sort communities"
          value={sort}
          onChange={setSort}
          options={[
            { value: "latest", label: "Latest" },
            { value: "popular", label: "Popular" },
            { value: "discussed", label: "Discussed" },
          ]}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Honest ordering: Latest sorts by creation date, Popular by member count, Discussed by recent posts. No hidden ranking.
        </p>
      </div>

      {isLoading && communities.length === 0 && (
        <ListSkeleton rows={4} />
      )}

      <div className="space-y-3">
        {sorted.map(community => (
          <CommunityCard
            key={community.id}
            community={community}
            currentUserId={currentUserId}
            router={router}
          />
        ))}

        {communities.length === 0 && !isLoading && (
          <div className="dyne-card">
            <EmptyState
              icon={Users}
              title="No communities found"
              description="Try a different search — or start the community your campus is missing."
              actionLabel="Create community"
              onAction={() => setShowCreateModal(true)}
            />
          </div>
        )}

        {hasMore && (
          <Button
            variant="outline"
            className="w-full mt-4"
            onClick={() => fetchCommunities(true)}
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Load more"}
          </Button>
        )}
      </div>

      {showCreateModal && (
        <CreateCommunityModal onClose={() => setShowCreateModal(false)} onSubmit={handleCreateCommunity} />
      )}
    </div>
  );
}

function CommunityCard({ community, currentUserId, router }: { community: CommunityData; currentUserId: string | null; router: ReturnType<typeof useRouter> }) {
  const isMember = community.is_member;

  return (
    <Card className="border hover:border-primary/50 transition-colors cursor-pointer"
      onClick={() => router.push(`/communities/${community.slug}`)}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-4">
          <div className="relative h-14 w-14 shrink-0 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
            {community.image_url ? (
              <Image src={community.image_url} alt="" fill className="object-cover" />
            ) : (
              <Users className="h-7 w-7 text-muted-foreground" />
            )}
            {community.is_private && (
              <Lock className="absolute bottom-0 right-0 h-4 w-4 text-muted-foreground bg-background rounded-full p-0.5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{community.name}</h3>
              {community.is_private && <Lock className="h-4 w-4 text-muted-foreground" />}
            </div>
            {community.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{community.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {community.member_count} members
              </span>
              {community.member_role !== "none" && (
                <Badge variant="secondary" className="text-xs capitalize">{community.member_role}</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {community.is_owner && (
              <Badge variant="outline" className="text-xs">Owner</Badge>
            )}
            {!community.is_owner && community.is_member && (
              <Badge variant="secondary" className="text-xs">Member</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateCommunityModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Create Community</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <Input name="name" required maxLength={100} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Slug</label>
            <Input name="slug" required maxLength={50} placeholder="community-name" />
            <p className="text-xs text-muted-foreground mt-1">Lowercase letters, numbers, and hyphens only</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description (optional)</label>
            <textarea name="description" className="w-full p-2 border rounded-md" rows={3} maxLength={2000} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="isPrivate" id="isPrivate" className="rounded" />
            <label htmlFor="isPrivate" className="text-sm">Private community</label>
          </div>
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" className="flex-1">Create</Button>
          </div>
        </form>
      </div>
    </div>
  );
}