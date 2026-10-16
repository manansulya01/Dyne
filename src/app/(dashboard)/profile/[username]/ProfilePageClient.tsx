"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiErrorMessage, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Separator } from "@/components/ui/Separator";
import { BottomSheet } from "@/components/ui/Sheet";
import { Textarea } from "@/components/ui/Textarea";
import {
  User,
  Users,
  Edit,
  UserPlus,
  UserMinus,
  Share2,
  Flag,
  CalendarDays,
} from "lucide-react";

interface ProfileData {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  accent: string | null;
  bio: string | null;
  role: string;
  class_grade: string | null;
  house: string | null;
  interests: string[];
  profile_tags: string[];
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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportStatus, setReportStatus] = useState<string | null>(null);

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
    <div className="mx-auto w-full max-w-2xl px-3 pb-6 pt-4 sm:px-4">
      <Card className="dyne-card overflow-hidden">
        <div
          className="h-32 w-full bg-gradient-to-r from-primary/30 via-primary/15 to-transparent sm:h-40"
          role="img"
          aria-label={profile.cover_image_url ? `${profile.display_name || profile.username}'s cover` : "Profile cover"}
          style={profile.cover_image_url ? { backgroundImage: `url(${profile.cover_image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        />
        <CardContent className="pt-0">
          <div className="-mt-10 flex flex-col gap-4 md:flex-row md:items-end">
            <Avatar className="h-24 w-24 md:h-28 md:w-28 shrink-0 mx-auto md:mx-0">
              <AvatarImage src={profile.avatar_url || ""} alt="" />
              <AvatarFallback name={profile.display_name || profile.username} />
            </Avatar>
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                <h1 className="text-2xl font-bold">{profile.display_name || profile.username}</h1>
                {(profile.roles.includes("admin") || profile.roles.includes("super_admin")) && (
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
                {profile.roles.includes("moderator") && (
                  <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded-full">Moderator</span>
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
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="min-h-[44px] min-w-[44px]"
                      onClick={async () => {
                        const url = `${window.location.origin}/profile/${profile.username}`;
                        try {
                          if (navigator.share) await navigator.share({ title: `${profile.display_name || profile.username} on Dyne`, url });
                          else await navigator.clipboard.writeText(url);
                        } catch { /* dismissed */ }
                      }}
                      aria-label="Share profile"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="min-h-[44px] min-w-[44px]"
                      onClick={() => setReportOpen(true)}
                      aria-label="Report profile"
                    >
                      <Flag className="h-4 w-4" />
                    </Button>
                  </>
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
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Interests">
              {profile.interests.map((interest) => (
                <span key={interest} className="px-2 py-1 text-sm bg-muted rounded-full">
                  {interest}
                </span>
              ))}
            </div>
          )}

          {(profile.profile_tags ?? []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Profile tags">
              {(profile.profile_tags ?? []).map((tag) => (
                <span key={tag} className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold tracking-wide text-primary">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <Separator className="my-6" />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex w-full">
              <TabsTrigger value="posts" className="min-h-[44px]">Posts</TabsTrigger>
              <TabsTrigger value="media" className="min-h-[44px]">Media</TabsTrigger>
              <TabsTrigger value="communities" className="min-h-[44px]">Groups</TabsTrigger>
              <TabsTrigger value="events" className="min-h-[44px]">Events</TabsTrigger>
              <TabsTrigger value="reactions" className="min-h-[44px]">Likes</TabsTrigger>
              <TabsTrigger value="saved" className="min-h-[44px]">Saved</TabsTrigger>
            </TabsList>

            <TabsContent value="posts" className="mt-4">
              <ProfilePosts username={profile.username} />
            </TabsContent>
            <TabsContent value="media" className="mt-4">
              <ProfileMedia username={profile.username} />
            </TabsContent>
            <TabsContent value="communities" className="mt-4">
              <ProfileCommunities userId={profile.id} />
            </TabsContent>
            <TabsContent value="events" className="mt-4">
              <ProfileEvents userId={profile.id} />
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
          </Tabs>
        </CardContent>
      </Card>

      <BottomSheet open={reportOpen} onClose={() => { setReportOpen(false); setReportReason(""); }} title="Report profile">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reportReason.trim()) return;
            try {
              const res = await fetch("/api/reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetType: "user", targetId: profile.id, reason: "other", description: reportReason.trim() }),
              });
              setReportStatus(res.ok ? "Thanks — moderators will review this profile." : "Could not submit the report.");
              if (res.ok) {
                setReportOpen(false);
                setReportReason("");
              }
            } catch {
              setReportStatus("Could not submit the report.");
            }
          }}
        >
          <label htmlFor="profile-report-reason" className="text-sm font-medium">Why are you reporting @{profile.username}?</label>
          <Textarea id="profile-report-reason" value={reportReason} onChange={(e) => setReportReason(e.target.value)} maxLength={2000} rows={3} placeholder="Impersonation, spam, harassment…" />
          <Button type="submit" className="w-full" disabled={!reportReason.trim()}>Submit report</Button>
        </form>
      </BottomSheet>
      {reportStatus && <p role="status" className="mt-3 text-center text-sm text-muted-foreground">{reportStatus}</p>}

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/posts/liked?limit=20")
      .then(async (res) => {
        const data = await res.json();
        // A failed request must not render as a false "no liked posts" empty state.
        if (!res.ok) throw new Error(await apiErrorMessage(res, "Could not load liked posts"));
        return data;
      })
      .then((data) => { if (!cancelled) setPosts(data.posts ?? []); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load liked posts"); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (isLoading) return <p className="text-center text-muted-foreground py-8">Loading…</p>;
  if (error) return <ErrorState title="Could not load liked posts" description={error} />;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/saved-posts?limit=20")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(await apiErrorMessage(res, "Could not load saved posts"));
        return data;
      })
      .then((data) => { if (!cancelled) setPosts(data.posts ?? []); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load saved posts"); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (isLoading) return <p className="text-center text-muted-foreground py-8">Loading…</p>;
  if (error) return <ErrorState title="Could not load saved posts" description={error} />;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/posts?limit=50&author=${encodeURIComponent(username)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(await apiErrorMessage(res, "Could not load media"));
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const media = ((data.posts ?? []) as PostWithRelations[]).flatMap((p) => p.media ?? []);
        setItems(media);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load media"); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [username]);

  if (isLoading) return <p className="text-center text-muted-foreground py-8">Loading…</p>;
  if (error) return <ErrorState title="Could not load media" description={error} />;
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

function ProfileCommunities({ userId }: { userId: string }) {
  const [items, setItems] = useState<Array<{ id: string; slug: string; name: string; description: string | null; member_count: number; is_private: boolean }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/communities?member=${userId}&limit=30`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(await apiErrorMessage(res, "Could not load communities"));
        return data;
      })
      .then((data) => { if (!cancelled) setItems(data.communities ?? []); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load communities"); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  if (isLoading) return <p className="py-8 text-center text-muted-foreground">Loading…</p>;
  if (error) return <ErrorState title="Could not load communities" description={error} />;
  if (items.length === 0) return <p className="py-8 text-center text-muted-foreground">No visible communities yet</p>;
  return (
    <ul className="space-y-2">
      {items.map((c) => (
        <li key={c.id}>
          <a href={`/communities/${c.slug}`} className="dyne-card dyne-card-hover flex items-center gap-3 p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{c.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {c.member_count} member{c.member_count === 1 ? "" : "s"}{c.is_private ? " · Private" : ""}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function ProfileEvents({ userId }: { userId: string }) {
  const [items, setItems] = useState<Array<{ id: string; title: string; start_time: string; location: { name?: string } | null; attendee_count: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [org, att] = await Promise.all([
          fetch(`/api/events?organizerId=${userId}&limit=20`).then((r) => r.json()),
          fetch(`/api/events?attendeeId=${userId}&limit=20`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        const seen = new Map<string, (typeof items)[number]>();
        for (const e of [...(org.events ?? []), ...(att.events ?? [])]) seen.set(e.id, e);
        setItems([...seen.values()].sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time)));
      } catch { /* empty state covers */ }
      finally { if (!cancelled) setIsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (isLoading) return <p className="py-8 text-center text-muted-foreground">Loading…</p>;
  if (items.length === 0) return <p className="py-8 text-center text-muted-foreground">No events yet</p>;
  return (
    <ul className="space-y-2">
      {items.map((e) => (
        <li key={e.id}>
          <a href={`/events/${e.id}`} className="dyne-card dyne-card-hover flex items-center gap-3 p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{e.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {formatRelativeTime(e.start_time)}
                {e.location?.name ? ` · ${e.location.name}` : ""} · {e.attendee_count} going
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
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