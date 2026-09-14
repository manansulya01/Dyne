"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Search, UserPlus, UserMinus } from "lucide-react";

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
}

interface PeoplePageClientProps {
  currentUserId: string | null;
}

export function PeoplePageClient({ currentUserId }: PeoplePageClientProps) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const fetchPeople = useCallback(async (isLoadMore = false) => {
    if (isLoadMore && (!hasMore || isLoading)) return;
    setIsLoading(true);

    try {
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) params.set("cursor", cursor);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (roleFilter !== "all") params.set("role", roleFilter);

      const response = await fetch(`/api/people?${params.toString()}`);
      const data = await response.json();

      if (data.profiles) {
        if (isLoadMore) {
          setProfiles(prev => [...prev, ...data.profiles]);
        } else {
          setProfiles(data.profiles);
        }
        setCursor(data.cursor);
        setHasMore(data.hasMore);
      }
    } catch (error) {
      console.error("Failed to fetch people:", error);
    } finally {
      setIsLoading(false);
    }
  }, [cursor, debouncedSearch, roleFilter, hasMore, isLoading]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCursor(null);
      setProfiles([]);
      setHasMore(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPeople();
  }, [debouncedSearch, roleFilter]);

  const handleFollow = useCallback(async (targetUserId: string, wasFollowing: boolean) => {
    if (!currentUserId) {
      router.push("/login");
      return false;
    }

    try {
      const response = await fetch("/api/follows", {
        method: wasFollowing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }, [currentUserId, router]);

  const roles = [
    { value: "all", label: "All" },
    { value: "student", label: "Students" },
    { value: "teacher", label: "Teachers" },
    { value: "staff", label: "Staff" },
    { value: "club", label: "Clubs" },
  ];

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">People</h1>
        
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or username..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="px-3 py-2 border rounded-md bg-background"
          >
            {roles.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && profiles.length === 0 && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      <div className="space-y-3">
        {profiles.map(profile => (
          <PersonCard
            key={profile.id}
            profile={profile}
            currentUserId={currentUserId}
            onFollow={handleFollow}
          />
        ))}

        {profiles.length === 0 && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No people found</p>
          </div>
        )}

        {hasMore && (
          <Button
            variant="outline"
            className="w-full mt-4"
            onClick={() => fetchPeople(true)}
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Load more"}
          </Button>
        )}
      </div>
    </div>
  );
}

function PersonCard({ profile, currentUserId, onFollow }: { 
  profile: ProfileData; 
  currentUserId: string | null;
  onFollow: (userId: string, wasFollowing: boolean) => Promise<boolean>;
}) {
  const [isFollowing, setIsFollowing] = useState(profile.is_following);
  const [isLoading, setIsLoading] = useState(false);

  const handleFollowClick = async () => {
    if (!currentUserId) return;
    if (profile.id === currentUserId) return;

    setIsLoading(true);
    const success = await onFollow(profile.id, isFollowing);
    if (success) {
      setIsFollowing(!isFollowing);
    }
    setIsLoading(false);
  };

  return (
    <Card className="border">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={profile.avatar_url || ""} alt="" />
            <AvatarFallback name={profile.display_name || profile.username} />
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{profile.display_name || profile.username}</span>
              <span className="text-muted-foreground text-sm">@{profile.username}</span>
              {profile.role !== "student" && (
                <Badge variant="secondary" className="text-xs">
                  {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                </Badge>
              )}
            </div>
            {profile.class_grade && (
              <p className="text-sm text-muted-foreground">{profile.class_grade}</p>
            )}
            {profile.house && (
              <p className="text-sm text-muted-foreground">{profile.house}</p>
            )}
          </div>
          {profile.id !== currentUserId && (
            <Button
              variant={isFollowing ? "secondary" : "default"}
              size="sm"
              onClick={handleFollowClick}
              disabled={isLoading}
            >
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
        </div>
      </CardContent>
    </Card>
  );
}