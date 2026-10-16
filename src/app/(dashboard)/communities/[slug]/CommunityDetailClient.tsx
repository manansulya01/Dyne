"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import {
  Users,
  UserPlus,
  UserMinus,
  ArrowLeft,
  Settings,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommunityData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  owner_id: string;
  is_private: boolean;
  rules: string[];
  created_at: string;
  member_count: number;
  is_member: boolean;
  is_owner: boolean;
  member_role: string;
  owner: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface PostData {
  id: string;
  author_id: string;
  content: string | null;
  is_pinned: boolean;
  created_at: string;
  author: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  media: Array<{
    id: string;
    media_type: "image" | "video";
    url: string;
    thumbnail_url: string | null;
  }>;
  reaction_count: number;
  comment_count: number;
}

interface CommunityDetailClientProps {
  initialCommunity: CommunityData;
  currentUserId: string | null;
}

export function CommunityDetailClient({ initialCommunity, currentUserId }: CommunityDetailClientProps) {
  const router = useRouter();
  const [community, setCommunity] = useState<CommunityData>(initialCommunity);
  const [activeTab, setActiveTab] = useState("posts");
  const [posts, setPosts] = useState<PostData[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsHasMore, setPostsHasMore] = useState(true);
  const [members, setMembers] = useState<Array<{
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
    joined_at: string;
  }>>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersTotal, setMembersTotal] = useState(0);
  const [membersHasMore, setMembersHasMore] = useState(false);
  const [membersCursor, setMembersCursor] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [postContent, setPostContent] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(initialCommunity.name);
  const [editDescription, setEditDescription] = useState(initialCommunity.description ?? "");
  const [editIsPrivate, setEditIsPrivate] = useState(initialCommunity.is_private);
  const [editRules, setEditRules] = useState((initialCommunity.rules ?? []).join("\n"));
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Cursor/loading refs: fetchPosts reads these instead of closing over
  // state, so "Load more" never triggers a stale full-reload that would
  // replace the appended page (effect deps stay stable).
  const postsCursorRef = useRef<string | null>(null);
  const postsHasMoreRef = useRef(true);
  const postsLoadingRef = useRef(false);

  const fetchPosts = useCallback(async (isLoadMore = false) => {
    if (isLoadMore && (!postsHasMoreRef.current || postsLoadingRef.current)) return;
    postsLoadingRef.current = true;
    setPostsLoading(true);

    try {
      const params = new URLSearchParams({ limit: "20" });
      if (postsCursorRef.current) params.set("cursor", postsCursorRef.current);

      const response = await fetch(`/api/communities/${community.id}/posts?${params.toString()}`);
      const data = await response.json();

      if (data.posts) {
        if (isLoadMore) {
          setPosts(prev => [...prev, ...data.posts]);
        } else {
          setPosts(data.posts);
        }
        postsCursorRef.current = data.cursor ?? null;
        postsHasMoreRef.current = !!data.hasMore;
        setPostsHasMore(data.hasMore);
      }
    } catch (error) {
      console.error("Failed to fetch posts:", error);
    } finally {
      postsLoadingRef.current = false;
      setPostsLoading(false);
    }
  }, [community.id]);

  const fetchMembers = useCallback(async (cursorValue?: string | null) => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const params = new URLSearchParams({ limit: "25" });
      if (cursorValue) params.set("cursor", cursorValue);
      const response = await fetch(`/api/communities/${community.id}/members?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load members");
      if (data.members) {
        // Dedupe on append: cursor pagination is joinedAt-based, so ties can
        // otherwise repeat a row.
        setMembers((prev) => {
          if (!cursorValue) return data.members;
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...data.members.filter((m: { id: string }) => !seen.has(m.id))];
        });
        setMembersTotal(typeof data.total === "number" ? data.total : data.members.length);
        setMembersHasMore(!!data.hasMore);
        setMembersCursor(data.cursor ?? null);
      }
    } catch (error) {
      console.error("Failed to fetch members:", error);
      setMembersError(error instanceof Error ? error.message : "Could not load members");
    } finally {
      setMembersLoading(false);
    }
  }, [community.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial server-state sync (fetchPosts/fetchMembers)
    fetchPosts();
    fetchMembers();
  }, [fetchPosts, fetchMembers]);

  const handleJoinLeave = async () => {
    if (!currentUserId) {
      router.push("/login");
      return;
    }

    if (community.id === currentUserId) return;

    try {
      const response = await fetch(`/api/communities/${community.id}/members`, {
        method: community.is_member ? "DELETE" : "POST",
      });

      if (response.ok) {
        setCommunity(prev => ({
          ...prev,
          is_member: !prev.is_member,
          member_count: prev.is_member ? prev.member_count - 1 : prev.member_count + 1,
          member_role: prev.is_member ? "none" : "member",
        }));
      }
    } catch (error) {
      console.error("Failed to join/leave community:", error);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const response = await fetch(`/api/communities/${community.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDescription || undefined,
          isPrivate: editIsPrivate,
          rules: editRules.split("\n").map((r) => r.trim()).filter(Boolean).slice(0, 10),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setEditError("Could not save changes");
        return;
      }
      setCommunity((prev) => ({ ...prev, ...data.community }));
      setShowEdit(false);
    } catch {
      setEditError("Network error. Please try again.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handlePinPost = async (postId: string, pinned: boolean) => {
    try {
      const res = await fetch(`/api/community-posts/${postId}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, is_pinned: pinned } : p))
        );
      }
    } catch {
      /* transient — pin state re-syncs on reload */
    }
  };

  const handleCreatePost = async (e: React.FormEvent<HTMLFormElement>) => {    e.preventDefault();
    if (!postContent.trim() || isCreatingPost) return;

    setIsCreatingPost(true);
    setPostError(null);
    const formData = new FormData();
    formData.append("content", postContent);
    formData.append("communityId", community.id);

    try {
      const response = await fetch("/api/community-posts", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.post) {
        setPosts([data.post, ...posts]);
        setPostContent("");
      } else {
        setPostError(
          typeof data.error === "string"
            ? data.error
            : data.error?._form?.[0] || "Failed to create post"
        );
      }
    } catch {
      setPostError("Failed to create post. Please try again.");
    } finally {
      setIsCreatingPost(false);
    }
  };

  const isModerator = ["moderator", "admin", "owner"].includes(community.member_role);
  const [postSort, setPostSort] = useState<"latest" | "popular" | "discussed">("latest");

  // Honest deterministic sorts over the loaded page. Pinned discussions
  // always stay on top; counts come from the server (never fabricated).
  const sortedPosts = [...posts].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    if (postSort === "popular") return b.reaction_count - a.reaction_count;
    if (postSort === "discussed") return b.comment_count - a.comment_count;
    return +new Date(b.created_at) - +new Date(a.created_at);
  });
  const canManageChannels = isModerator || community.is_owner;

  return (
    <div className="max-w-3xl mx-auto p-4">
      <Button variant="ghost" size="icon" onClick={() => router.back()} className="mb-4">
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="relative h-24 w-24 md:h-28 md:w-28 shrink-0 mx-auto md:mx-0 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              {community.image_url ? (
                <Image src={community.image_url} alt="" fill sizes="112px" className="object-cover" />
              ) : (
                <Users className="h-10 w-10 text-muted-foreground" />
              )}
              {community.is_private && (
                <div className="absolute bottom-0 right-0 h-6 w-6 text-muted-foreground bg-background rounded-full p-1 flex items-center justify-center">
                  <Lock className="h-4 w-4" />
                </div>
              )}
            </div>
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                <h1 className="text-2xl font-bold">{community.name}</h1>
                {community.is_private && <Lock className="h-4 w-4 text-muted-foreground" />}
              </div>
              {community.description && (
                <p className="text-muted-foreground mb-2">{community.description}</p>
              )}
              <div className="flex items-center justify-center md:justify-start gap-4">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {community.member_count} members
                </span>
                <span className="text-sm text-muted-foreground">
                  Created {formatRelativeTime(community.created_at)}
                </span>
              </div>
              {(community.rules ?? []).length > 0 && (
                <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Community rules</p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm">
                    {(community.rules ?? []).map((rule, i) => (
                      <li key={i}>{rule}</li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="flex items-center justify-center md:justify-start gap-2 mt-4">
                {isModerator ? (
                  <Button variant="outline" onClick={() => setShowEdit((v) => !v)} aria-expanded={showEdit}>
                    <Settings className="h-4 w-4 mr-2" />
                    {showEdit ? "Close settings" : "Settings"}
                  </Button>
                ) : null}
                {community.is_owner ? null : community.is_member ? (
                  <Button variant="secondary" onClick={handleJoinLeave}>
                    <UserMinus className="h-4 w-4 mr-2" />
                    Leave
                  </Button>
                ) : (
                  <Button onClick={handleJoinLeave}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Join
                  </Button>
                )}
                {!community.is_owner && community.is_member && !isModerator && (
                  <Button variant="ghost" size="icon" onClick={handleJoinLeave} aria-label="Leave community">
                    <UserMinus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {showEdit && isModerator && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <h2 className="font-semibold">Community settings</h2>
              <div>
                <label htmlFor="community-name" className="text-sm font-medium">Name</label>
                <input
                  id="community-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={100}
                  required
                  className="w-full min-h-[44px] p-2 border rounded-md bg-background"
                />
              </div>
              <div>
                <label htmlFor="community-description" className="text-sm font-medium">Description</label>
                <Textarea
                  id="community-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  maxLength={2000}
                  rows={3}
                />
              </div>
              <label className="flex items-center gap-2 text-sm min-h-[44px]">
                <input
                  type="checkbox"
                  checked={editIsPrivate}
                  onChange={(e) => setEditIsPrivate(e.target.checked)}
                  className="rounded"
                />
                Private community
              </label>
              <div>
                <label htmlFor="community-rules" className="text-sm font-medium">Community rules (one per line, max 10)</label>
                <Textarea
                  id="community-rules"
                  value={editRules}
                  onChange={(e) => setEditRules(e.target.value)}
                  rows={4}
                  maxLength={2200}
                  placeholder={"Be kind to fellow members\nNo spam or self-promotion"}
                />
              </div>
              {editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}
              <Button type="submit" disabled={isSavingEdit} className="min-h-[44px]">
                {isSavingEdit ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full">
          <TabsTrigger value="posts" className="min-h-[44px]">Posts</TabsTrigger>
          <TabsTrigger value="channels" className="min-h-[44px]">Channels</TabsTrigger>
          <TabsTrigger value="polls" className="min-h-[44px]">Polls</TabsTrigger>
          <TabsTrigger value="members" className="min-h-[44px]">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-4">
          {community.is_member && (
            <Card className="mb-4 border-dashed">
              <CardContent className="pt-4">
                <form onSubmit={handleCreatePost} className="space-y-3">
                  <div className="flex gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={currentUserId ? "" : ""} alt="" />
                      <AvatarFallback>You</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <Textarea
                        placeholder="Share something with the community..."
                        value={postContent}
                        onChange={e => setPostContent(e.target.value)}
                        className="min-h-[80px] resize-none"
                        disabled={isCreatingPost}
                        aria-label="Post content"
                      />
                      {postError && <p role="alert" className="text-sm text-destructive">{postError}</p>}
                      <div className="flex justify-end">
                        <Button type="submit" disabled={isCreatingPost}>
                          {isCreatingPost ? "Posting..." : "Post"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {posts.length} discussion{posts.length === 1 ? "" : "s"} · sorted by {postSort === "latest" ? "newest" : postSort === "popular" ? "reactions" : "comments"}
            </p>
            <div className="flex gap-1" role="group" aria-label="Sort discussions">
              {(["latest", "popular", "discussed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setPostSort(s)}
                  aria-pressed={postSort === s}
                  className={cn(
                    "min-h-[44px] rounded-lg px-3 text-xs font-medium capitalize transition-colors",
                    postSort === s ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {sortedPosts.map(post => (
              <CommunityPostCard key={post.id} post={post} canPin={isModerator} onPin={handlePinPost} />
            ))}
            {posts.length === 0 && !postsLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <p>No posts yet. Be the first to share!</p>
              </div>
            )}
            {postsHasMore && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fetchPosts(true)}
                disabled={postsLoading}
              >
                {postsLoading ? "Loading..." : "Load more"}
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="channels" className="mt-4">
          <CommunityChannels
            communityId={community.id}
            isMember={community.is_member}
            canManage={canManageChannels}
            isOwner={community.is_owner}
          />
        </TabsContent>

        <TabsContent value="polls" className="mt-4">
          <CommunityPolls communityId={community.id} isMember={community.is_member} />
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <CardContent>
              {membersError ? (
                <div className="space-y-3 py-4" role="alert">
                  <p className="text-sm text-destructive">{membersError}</p>
                  <Button variant="outline" onClick={() => void fetchMembers()} className="min-h-[44px]">
                    Try again
                  </Button>
                </div>
              ) : membersLoading && members.length === 0 ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                <div className="space-y-3">
                  {members.map(member => (
                    <MemberCard key={member.id} member={member} isModerator={isModerator} isOwner={community.is_owner} currentUserId={currentUserId} communityId={community.id} />
                  ))}
                  {members.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No members yet</p>
                  )}
                  {members.length > 0 && (
                    <p className="text-center text-xs text-muted-foreground" aria-live="polite">
                      Showing {members.length} of {membersTotal}
                    </p>
                  )}
                  {membersHasMore && membersCursor && (
                    <Button
                      variant="outline"
                      className="w-full min-h-[44px]"
                      disabled={membersLoading}
                      onClick={() => void fetchMembers(membersCursor)}
                    >
                      {membersLoading ? "Loading…" : "Load more members"}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CommunityChannels({ communityId, isMember, canManage, isOwner }: {
  communityId: string;
  isMember: boolean;
  canManage: boolean;
  isOwner: boolean;
}) {
  const [channels, setChannels] = useState<Array<{ id: string; name: string; topic: string | null; conversationCount: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}/channels`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load channels");
      setChannels(data.channels ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load channels");
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  // Channel list is server state: fetch on mount and whenever the community
  // changes. The synchronous loading flag is intentional — without it the
  // previous community's channels would flash as current.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), topic: topic.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not create channel");
      setName("");
      setTopic("");
      void load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create channel");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (channelId: string, channelName: string) => {
    if (!window.confirm(`Delete #${channelName}? Its conversations stay, unlinked.`)) return;
    const res = await fetch(`/api/communities/${communityId}/channels/${channelId}`, { method: "DELETE" });
    if (res.ok) void load();
  };

  if (!isMember) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Join this community to see its channels.</p>;
  }
  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground" role="status">Loading channels…</p>;
  }
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">
        <p>{error}</p>
        <Button variant="outline" className="mt-2 min-h-[44px]" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-2" aria-label="Community channels">
        {channels.map((c) => (
          <li key={c.id}>
            <Card>
              <CardContent className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-bold text-primary" aria-hidden="true">#</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.topic || "No topic"} · {c.conversationCount} chat{c.conversationCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="min-h-[44px]" asChild>
                  <Link href={`/chat?community=${communityId}&channel=${c.id}`}>Open</Link>
                </Button>
                {isOwner && (
                  <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={() => void remove(c.id, c.name)} aria-label={`Delete channel ${c.name}`}>
                    Delete
                  </Button>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
        {channels.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No channels yet.</p>
        )}
      </ul>
      {canManage && (
        <form onSubmit={create} className="space-y-2 rounded-2xl border border-border p-4">
          <p className="text-sm font-semibold">New channel</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. announcements" maxLength={40} className="min-h-[44px]" aria-label="Channel name" />
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic (optional)" maxLength={140} className="min-h-[44px]" aria-label="Channel topic" />
          </div>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" disabled={busy || !name.trim()} className="min-h-[44px]">Create channel</Button>
        </form>
      )}
    </div>
  );
}

function CommunityPostCard({ post, canPin, onPin }: { post: PostData; canPin?: boolean; onPin?: (id: string, pinned: boolean) => void }) {
  return (
    <Card className={post.is_pinned ? "border-primary/40" : undefined}>
      <CardContent className="pt-4">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={post.author?.avatar_url || ""} alt="" />
            <AvatarFallback name={post.author?.display_name || post.author?.username} />
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{post.author?.display_name || post.author?.username}</span>
              <span className="text-muted-foreground text-sm">@{post.author?.username}</span>
              <span className="text-muted-foreground text-sm">·</span>
              <time className="text-muted-foreground text-sm">{formatRelativeTime(post.created_at)}</time>
              {post.is_pinned && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Pinned</span>
              )}
              {canPin && onPin && (
                <button
                  onClick={() => onPin(post.id, !post.is_pinned)}
                  className="ml-auto min-h-[44px] rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={post.is_pinned ? "Unpin discussion" : "Pin discussion"}
                >
                  {post.is_pinned ? "Unpin" : "Pin"}
                </button>
              )}
            </div>
            {post.content && <p className="mt-1 whitespace-pre-wrap">{post.content}</p>}
            {post.media && post.media.length > 0 && (
              <div className="mt-2 grid gap-2 grid-cols-2">
                {post.media.map((m, i) => (
                  <div key={i} className="relative aspect-video overflow-hidden rounded-lg bg-muted">
                    {m.media_type === "image" ? (
                      <Image src={m.url} alt="" fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover" loading="lazy" />
                    ) : (
                      <video src={m.url} controls className="h-full w-full" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MemberCard({ member, isModerator, isOwner, currentUserId, communityId }: {
  member: { id: string; username: string; display_name: string | null; avatar_url: string | null; profile_tags?: string[]; role: string; joined_at: string };
  isModerator: boolean;
  isOwner: boolean;
  currentUserId: string | null;
  communityId: string;
}) {
  const [role, setRole] = useState(member.role);
  const [isUpdating, setIsUpdating] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  const handleRoleChange = async (newRole: string) => {
    if (!isModerator || member.id === currentUserId || member.role === "owner") return;

    setIsUpdating(true);
    setRoleError(null);
    try {
      const response = await fetch(`/api/communities/${communityId}/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (response.ok) {
        setRole(newRole);
      } else {
        const data = await response.json().catch(() => null);
        setRoleError(typeof data?.error === "string" ? data.error : "Could not change role");
      }
    } catch {
      setRoleError("Network error. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={member.avatar_url || ""} alt="" />
          <AvatarFallback name={member.display_name || member.username} />
        </Avatar>
        <div>
          <p className="font-medium">{member.display_name || member.username}</p>
          <p className="text-sm text-muted-foreground">@{member.username}</p>
          {(member.profile_tags ?? []).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {(member.profile_tags ?? []).map((t) => (
                <span key={t} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">#{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={role === "owner" || role === "admin" ? "default" : role === "moderator" ? "secondary" : "outline"} className="capitalize">
          {role}
        </Badge>
        {isModerator && member.id !== currentUserId && member.role !== "owner" && (
          <span className="flex flex-col gap-1">
            <select
              value={role}
              onChange={e => handleRoleChange(e.target.value)}
              disabled={isUpdating}
              aria-label={`Role for ${member.username}`}
              className="min-h-[44px] text-sm border rounded px-2 py-1"
            >
              <option value="member">Member</option>
              <option value="moderator">Moderator</option>
              {isOwner && <option value="admin">Administrator</option>}
            </select>
            {roleError && <span role="alert" className="text-xs text-destructive">{roleError}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

function CommunityPolls({ communityId, isMember }: { communityId: string; isMember: boolean }) {
  const [polls, setPolls] = useState<Array<{
    id: string; question: string; options: string[]; counts: number[];
    totalVotes: number; myVote: number | null; closesAt?: string | null;
    author?: { display_name?: string | null; username?: string } | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/polls?communityId=${communityId}`);
      const json = await res.json();
      if (res.ok) setPolls(json.polls ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [communityId]);

  // Initial polls load only.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const vote = async (pollId: string, idx: number) => {
    setPolls((prev) => prev.map((p) => {
      if (p.id !== pollId) return p;
      const counts = [...p.counts];
      if (p.myVote != null && p.myVote >= 0) counts[p.myVote] = Math.max(0, counts[p.myVote] - 1);
      counts[idx] = (counts[idx] ?? 0) + 1;
      return { ...p, counts, totalVotes: counts.reduce((a, b) => a + b, 0), myVote: idx };
    }));
    try {
      await fetch(`/api/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIndex: idx }),
      });
    } catch { /* optimistic */ }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const clean = options.map((o) => o.trim()).filter(Boolean);
      if (!question.trim() || clean.length < 2) {
        setError("Add a question and at least two options");
        return;
      }
      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId, question: question.trim(), options: clean }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(typeof j?.error === "string" ? j.error : "Could not create poll");
      }
      setQuestion("");
      setOptions(["", ""]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create poll");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="py-6 text-center text-sm text-muted-foreground">Loading polls…</p>;

  return (
    <div className="space-y-3">
      {isMember && (
        <Card>
          <CardContent className="space-y-2 pt-4">
            <form onSubmit={create} className="space-y-2" aria-label="Create poll">
              <label htmlFor="poll-q" className="text-sm font-medium">Ask the community</label>
              <Textarea id="poll-q" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} placeholder="Which day works for the study session?" rows={2} />
              {options.map((o, i) => (
                <input
                  key={i}
                  value={o}
                  onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Option ${i + 1}`}
                  maxLength={120}
                  aria-label={`Option ${i + 1}`}
                  className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              ))}
              <div className="flex gap-2">
                {options.length < 6 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setOptions((p) => [...p, ""])}>Add option</Button>
                )}
                <Button type="submit" size="sm" disabled={busy} className="ml-auto">{busy ? "Posting…" : "Post poll"}</Button>
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </form>
          </CardContent>
        </Card>
      )}
      {polls.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No polls yet. Start the first community vote.</p>}
      {polls.map((p) => (
        <Card key={p.id}>
          <CardContent className="space-y-2 pt-4">
            <p className="text-sm font-semibold">{p.question}</p>
            <p className="text-xs text-muted-foreground">{p.totalVotes} {p.totalVotes === 1 ? "vote" : "votes"}</p>
            <div className="space-y-1.5">
              {p.options.map((opt, i) => {
                const pct = p.totalVotes > 0 ? Math.round(((p.counts[i] ?? 0) / p.totalVotes) * 100) : 0;
                const mine = p.myVote === i;
                return (
                  <button
                    key={i}
                    disabled={!isMember}
                    onClick={() => vote(p.id, i)}
                    aria-pressed={mine}
                    className={cn("relative min-h-[44px] w-full overflow-hidden rounded-xl border px-3 text-left text-sm", mine ? "border-primary" : "border-border hover:border-primary/50")}
                  >
                    <span className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${pct}%` }} aria-hidden="true" />
                    <span className="relative flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{opt}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{pct}% · {p.counts[i] ?? 0}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}