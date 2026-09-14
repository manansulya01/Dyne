"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Separator } from "@/components/ui/Separator";
import {
  User,
  Users,
  Edit,
  MoreHorizontal,
  UserPlus,
  UserMinus,
} from "lucide-react";

interface ProfileData {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: string;
  class_grade: string | null;
  house: string | null;
  interests: string[];
  created_at: string;
  followers_count: number;
  following_count: number;
  is_following: boolean;
  is_own: boolean;
  roles: string[];
}

interface ProfilePageClientProps {
  initialProfile: ProfileData | null;
  currentUser: ProfileData | null;
  targetUsername: string;
}

interface PostWithRelations {
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
}

export function ProfilePageClient({ initialProfile, currentUser, targetUsername }: ProfilePageClientProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(initialProfile);
  const [isLoading, setIsLoading] = useState(!initialProfile);
  const [activeTab, setActiveTab] = useState("posts");
  const [isFollowing, setIsFollowing] = useState(initialProfile?.is_following || false);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      // /api/profile expects a UUID; resolve usernames via people search first.
      let userId = targetUsername === "@me" ? "" : targetUsername;
      if (targetUsername !== "@me") {
        const searchRes = await fetch(`/api/people?search=${encodeURIComponent(targetUsername)}&limit=5`);
        const searchData = await searchRes.json();
        const match = (searchData.profiles ?? []).find(
          (p: { username: string }) => p.username.toLowerCase() === targetUsername.toLowerCase()
        );
        if (!match) {
          setProfile(null);
          return;
        }
        userId = match.id;
      }
      const response = await fetch(`/api/profile?userId=${userId}`);
      const data = await response.json();
      if (data.profile) {
        setProfile(data.profile);
        setIsFollowing(data.profile.is_following);
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setIsLoading(false);
    }
  }, [targetUsername]);

  useEffect(() => {
    if (!initialProfile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchProfile();
    }
  }, [initialProfile, fetchProfile]);

  const handleFollow = useCallback(async () => {
    if (!currentUser) {
      router.push("/login");
      return;
    }

    if (profile?.id === currentUser.id) return;

    const wasFollowing = isFollowing;
    setIsFollowing(!isFollowing);

    try {
      const response = await fetch("/api/follows", {
        method: wasFollowing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: profile?.id }),
      });

      if (!response.ok) {
        setIsFollowing(wasFollowing);
      }
    } catch {
      setIsFollowing(wasFollowing);
    }
  }, [currentUser, isFollowing, profile, router]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Profile not found</h2>
      </div>
    );
  }

  const isOwnProfile = profile.is_own;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            <Avatar className="h-24 w-24 md:h-28 md:w-28 shrink-0 mx-auto md:mx-0">
              <AvatarImage src={profile.avatar_url || ""} alt="" />
              <AvatarFallback name={profile.display_name || profile.username} />
            </Avatar>
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                <h1 className="text-2xl font-bold">{profile.display_name || profile.username}</h1>
                {profile.roles.includes("admin") && (
                  <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">Admin</span>
                )}
                {profile.roles.includes("teacher") && (
                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">Teacher</span>
                )}
                {profile.roles.includes("staff") && (
                  <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Staff</span>
                )}
                {profile.roles.includes("club") && (
                  <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">Club</span>
                )}
              </div>
              <p className="text-muted-foreground">@{profile.username}</p>
              {profile.class_grade && (
                <p className="text-sm text-muted-foreground flex items-center justify-center md:justify-start gap-1">
                  <User className="h-4 w-4" />
                  {profile.class_grade}
                </p>
              )}
              {profile.house && (
                <p className="text-sm text-muted-foreground flex items-center justify-center md:justify-start gap-1">
                  <Users className="h-4 w-4" />
                  {profile.house}
                </p>
              )}
              <div className="flex items-center justify-center md:justify-start gap-4 mt-4">
                <div>
                  <p className="text-2xl font-bold">{profile.followers_count}</p>
                  <p className="text-sm text-muted-foreground">Followers</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{profile.following_count}</p>
                  <p className="text-sm text-muted-foreground">Following</p>
                </div>
              </div>
              <div className="flex items-center justify-center md:justify-start gap-2 mt-4">
                {isOwnProfile ? (
                  <Button variant="outline" asChild>
                    <a href="/settings">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Profile
                    </a>
                  </Button>
                ) : (
                  <Button onClick={handleFollow} variant={isFollowing ? "secondary" : "default"}>
                    {isFollowing ? (
                      <>
                        <UserMinus className="h-4 w-4 mr-2" />
                        Following
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Follow
                      </>
                    )}
                  </Button>
                )}
                {!isOwnProfile && (
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {profile.bio && (
            <div className="mt-6 pt-6 border-t">
              <p className="whitespace-pre-wrap">{profile.bio}</p>
            </div>
          )}

          {profile.interests.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.interests.map((interest) => (
                <span key={interest} className="px-2 py-1 text-sm bg-muted rounded-full">
                  {interest}
                </span>
              ))}
            </div>
          )}

          <Separator className="my-6" />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="posts" className="min-h-[44px]">Posts</TabsTrigger>
              <TabsTrigger value="reactions" className="min-h-[44px]">Likes</TabsTrigger>
              <TabsTrigger value="saved" className="min-h-[44px]">Saved</TabsTrigger>
              <TabsTrigger value="media" className="min-h-[44px]">Media</TabsTrigger>
            </TabsList>

            <TabsContent value="posts" className="mt-4">
              <ProfilePosts username={profile.username} />
            </TabsContent>
            <TabsContent value="reactions" className="mt-4">
              {profile.is_own ? (
                <ProfileLikedPosts />
              ) : (
                <p className="text-center text-muted-foreground py-8">Likes are private</p>
              )}
            </TabsContent>
            <TabsContent value="saved" className="mt-4">
              {profile.is_own ? (
                <ProfileSavedPosts />
              ) : (
                <p className="text-center text-muted-foreground py-8">Saved posts are private</p>
              )}
            </TabsContent>
            <TabsContent value="media" className="mt-4">
              <ProfileMedia username={profile.username} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground mt-4">
        Joined {formatRelativeTime(profile.created_at)}
      </p>
    </div>
  );
}

function ProfilePosts({ username }: { username: string }) {
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ limit: "20", author: username });
        const response = await fetch(`/api/posts?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load posts");
        if (!cancelled) {
          setPosts(data.posts ?? []);
          setCursor(data.posts?.[data.posts.length - 1]?.created_at ?? null);
          setHasMore((data.posts ?? []).length === 20);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load posts");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [username]);

  const loadMore = async () => {
    if (!hasMore || isLoadingMore || !cursor) return;
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: "20", author: username, cursor });
      const response = await fetch(`/api/posts?${params.toString()}`);
      const data = await response.json();
      if (response.ok && data.posts) {
        setPosts((prev) => [...prev, ...data.posts]);
        setCursor(data.posts[data.posts.length - 1]?.created_at ?? null);
        setHasMore(data.posts.length === 20);
      }
    } catch (e) {
      console.error("Failed to fetch posts:", e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (isLoading) {
    return <p className="text-center text-muted-foreground py-8">Loading posts…</p>;
  }

  if (error) {
    return <p role="alert" className="text-center text-destructive py-8">{error}</p>;
  }

  if (posts.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No posts yet</p>;
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <ProfilePostCard key={post.id} post={post} />
      ))}
      {hasMore && (
        <Button
          variant="outline"
          className="w-full min-h-[44px]"
          onClick={loadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? "Loading..." : "Load more"}
        </Button>
      )}
    </div>
  );
}

function ProfileLikedPosts() {
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/posts/liked?limit=20")
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setPosts(data.posts ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (isLoading) return <p className="text-center text-muted-foreground py-8">Loading…</p>;
  if (posts.length === 0) return <p className="text-center text-muted-foreground py-8">No liked posts yet</p>;
  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <ProfilePostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

function ProfileSavedPosts() {
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/saved-posts?limit=20")
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setPosts(data.posts ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (isLoading) return <p className="text-center text-muted-foreground py-8">Loading…</p>;
  if (posts.length === 0) return <p className="text-center text-muted-foreground py-8">No saved posts yet</p>;
  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <ProfilePostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

function ProfileMedia({ username }: { username: string }) {
  const [items, setItems] = useState<Array<{ id: string; media_type: "image" | "video"; url: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/posts?limit=50&author=${encodeURIComponent(username)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const media = ((data.posts ?? []) as PostWithRelations[]).flatMap((p) => p.media ?? []);
        setItems(media);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [username]);

  if (isLoading) return <p className="text-center text-muted-foreground py-8">Loading…</p>;
  if (items.length === 0) return <p className="text-center text-muted-foreground py-8">No media yet</p>;
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((m) => (
        <div key={m.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
          {m.media_type === "image" ? (
            <Image src={m.url} alt="" fill className="object-cover" sizes="33vw" />
          ) : (
            <video src={m.url} className="absolute inset-0 h-full w-full object-cover" muted playsInline preload="metadata" />
          )}
        </div>
      ))}
    </div>
  );
}

function ProfilePostCard({ post }: { post: PostWithRelations }) {
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
                  <div key={i} className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                    {m.media_type === "image" ? (
                      <Image src={m.url} alt="" fill className="object-cover" sizes="50vw" />
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