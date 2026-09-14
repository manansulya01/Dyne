"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Separator } from "@/components/ui/Separator";
import { Textarea } from "@/components/ui/Textarea";
import {
  Users,
  MessageSquare,
  Edit,
  MoreHorizontal,
  Plus,
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
  const [postsCursor, setPostsCursor] = useState<string | null>(null);
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
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(initialCommunity.name);
  const [editDescription, setEditDescription] = useState(initialCommunity.description ?? "");
  const [editIsPrivate, setEditIsPrivate] = useState(initialCommunity.is_private);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchPosts = useCallback(async (isLoadMore = false) => {
    if (isLoadMore && (!postsHasMore || postsLoading)) return;
    setPostsLoading(true);

    try {
      const params = new URLSearchParams({ limit: "20" });
      if (postsCursor) params.set("cursor", postsCursor);

      const response = await fetch(`/api/communities/${community.id}/posts?${params.toString()}`);
      const data = await response.json();

      if (data.posts) {
        if (isLoadMore) {
          setPosts(prev => [...prev, ...data.posts]);
        } else {
          setPosts(data.posts);
        }
        setPostsCursor(data.cursor);
        setPostsHasMore(data.hasMore);
      }
    } catch (error) {
      console.error("Failed to fetch posts:", error);
    } finally {
      setPostsLoading(false);
    }
  }, [community.id, postsCursor, postsHasMore, postsLoading]);

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const response = await fetch(`/api/communities/${community.id}/members`);
      const data = await response.json();
      if (data.members) {
        setMembers(data.members);
      }
    } catch (error) {
      console.error("Failed to fetch members:", error);
    } finally {
      setMembersLoading(false);
    }
  }, [community.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPosts();
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const handleCreatePost = async (e: React.FormEvent<HTMLFormElement>) => {    e.preventDefault();
    if (!postContent.trim() || isCreatingPost) return;

    setIsCreatingPost(true);
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
        setShowCreatePost(false);
      } else {
        alert(data.error?._form?.[0] || "Failed to create post");
      }
    } catch (error) {
      alert("Failed to create post");
    } finally {
      setIsCreatingPost(false);
    }
  };

  const isModerator = community.member_role === "moderator" || community.member_role === "owner";

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
                <img src={community.image_url} alt="" className="h-full w-full object-cover" />
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
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
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
              {editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}
              <Button type="submit" disabled={isSavingEdit} className="min-h-[44px]">
                {isSavingEdit ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="members">Members ({community.member_count})</TabsTrigger>
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
                      />
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

          <div className="space-y-4">
            {posts.map(post => (
              <CommunityPostCard key={post.id} post={post} />
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

        <TabsContent value="members" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <CardContent>
              {membersLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                <div className="space-y-3">
                  {members.map(member => (
                    <MemberCard key={member.id} member={member} isModerator={isModerator} currentUserId={currentUserId} communityId={community.id} />
                  ))}
                  {members.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No members yet</p>
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

function CommunityPostCard({ post }: { post: PostData }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={post.author?.avatar_url || ""} alt="" />
            <AvatarFallback name={post.author?.display_name || post.author?.username} />
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{post.author?.display_name || post.author?.username}</span>
              <span className="text-muted-foreground text-sm">@{post.author?.username}</span>
              <span className="text-muted-foreground text-sm">·</span>
              <time className="text-muted-foreground text-sm">{formatRelativeTime(post.created_at)}</time>
            </div>
            {post.content && <p className="mt-1 whitespace-pre-wrap">{post.content}</p>}
            {post.media && post.media.length > 0 && (
              <div className="mt-2 grid gap-2 grid-cols-2">
                {post.media.map((m, i) => (
                  <div key={i} className="aspect-video rounded-lg overflow-hidden bg-muted">
                    {m.media_type === "image" ? (
                      <img src={m.url} alt="" className="h-full w-full object-cover" />
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

function MemberCard({ member, isModerator, currentUserId, communityId }: {
  member: { id: string; username: string; display_name: string | null; avatar_url: string | null; role: string; joined_at: string };
  isModerator: boolean;
  currentUserId: string | null;
  communityId: string;
}) {
  const [role, setRole] = useState(member.role);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleRoleChange = async (newRole: string) => {
    if (!isModerator || member.id === currentUserId || member.role === "owner") return;
    
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/communities/${communityId}/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (response.ok) {
        setRole(newRole);
      }
    } catch (error) {
      console.error("Failed to update role:", error);
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
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={role === "owner" ? "default" : role === "moderator" ? "secondary" : "outline"} className="capitalize">
          {role}
        </Badge>
        {isModerator && member.id !== currentUserId && member.role !== "owner" && (
          <select
            value={role}
            onChange={e => handleRoleChange(e.target.value)}
            disabled={isUpdating}
            className="text-sm border rounded px-2 py-1"
          >
            <option value="member">Member</option>
            <option value="moderator">Moderator</option>
          </select>
        )}
      </div>
    </div>
  );
}