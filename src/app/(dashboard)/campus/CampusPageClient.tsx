"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Search, Building2, Users, MapPin } from "lucide-react";

interface BuildingData {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
  floor_count: number | null;
  created_at: string;
}

interface ClubData {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  is_official: boolean;
  created_at: string;
}

export function CampusPageClient() {
  const [activeTab, setActiveTab] = useState("buildings");
  const [buildings, setBuildings] = useState<BuildingData[]>([]);
  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [buildingsLoading, setBuildingsLoading] = useState(true);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [buildingsCursor, setBuildingsCursor] = useState<string | null>(null);
  const [clubsCursor, setClubsCursor] = useState<string | null>(null);
  const [buildingsHasMore, setBuildingsHasMore] = useState(true);
  const [clubsHasMore, setClubsHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [clubCategoryFilter, setClubCategoryFilter] = useState("all");

  const fetchBuildings = useCallback(async (isLoadMore = false) => {
    if (isLoadMore && (!buildingsHasMore || buildingsLoading)) return;
    setBuildingsLoading(true);

    try {
      const params = new URLSearchParams({ limit: "20" });
      if (buildingsCursor) params.set("cursor", buildingsCursor);
      if (debouncedSearch) params.set("search", debouncedSearch);

      const response = await fetch(`/api/campus/buildings?${params.toString()}`);
      const data = await response.json();

      if (data.buildings) {
        if (isLoadMore) {
          setBuildings(prev => [...prev, ...data.buildings]);
        } else {
          setBuildings(data.buildings);
        }
        setBuildingsCursor(data.cursor);
        setBuildingsHasMore(data.hasMore);
      }
    } catch (error) {
      console.error("Failed to fetch buildings:", error);
    } finally {
      setBuildingsLoading(false);
    }
  }, [buildingsCursor, debouncedSearch, buildingsHasMore, buildingsLoading]);

  const fetchClubs = useCallback(async (isLoadMore = false) => {
    if (isLoadMore && (!clubsHasMore || clubsLoading)) return;
    setClubsLoading(true);

    try {
      const params = new URLSearchParams({ limit: "20" });
      if (clubsCursor) params.set("cursor", clubsCursor);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (clubCategoryFilter !== "all") params.set("category", clubCategoryFilter);

      const response = await fetch(`/api/campus/clubs?${params.toString()}`);
      const data = await response.json();

      if (data.clubs) {
        if (isLoadMore) {
          setClubs(prev => [...prev, ...data.clubs]);
        } else {
          setClubs(data.clubs);
        }
        setClubsCursor(data.cursor);
        setClubsHasMore(data.hasMore);
        if (data.categories) {
          setCategories(data.categories);
        }
      }
    } catch (error) {
      console.error("Failed to fetch clubs:", error);
    } finally {
      setClubsLoading(false);
    }
  }, [clubsCursor, debouncedSearch, clubCategoryFilter, clubsHasMore, clubsLoading]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setBuildingsCursor(null);
      setClubsCursor(null);
      setBuildings([]);
      setClubs([]);
      setBuildingsHasMore(true);
      setClubsHasMore(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBuildings();
  }, [debouncedSearch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchClubs();
  }, [debouncedSearch, clubCategoryFilter]);

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Campus</h1>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search campus..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="buildings">
            <Building2 className="h-4 w-4 mr-2" />
            Buildings
          </TabsTrigger>
          <TabsTrigger value="clubs">
            <Users className="h-4 w-4 mr-2" />
            Clubs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="buildings" className="mt-4">
          <div className="space-y-3">
            {buildingsLoading && buildings.length === 0 && (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            )}

            {buildings.map(building => (
              <BuildingCard key={building.id} building={building} />
            ))}

            {buildings.length === 0 && !buildingsLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No buildings found</p>
              </div>
            )}

            {buildingsHasMore && (
              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={() => fetchBuildings(true)}
                disabled={buildingsLoading}
              >
                {buildingsLoading ? "Loading..." : "Load more"}
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="clubs" className="mt-4">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clubs..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={clubCategoryFilter}
              onChange={e => setClubCategoryFilter(e.target.value)}
              className="px-3 py-2 border rounded-md bg-background w-full sm:w-48"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {clubsLoading && clubs.length === 0 && (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            )}

            {clubs.map(club => (
              <ClubCard key={club.id} club={club} />
            ))}

            {clubs.length === 0 && !clubsLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No clubs found</p>
              </div>
            )}

            {clubsHasMore && (
              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={() => fetchClubs(true)}
                disabled={clubsLoading}
              >
                {clubsLoading ? "Loading..." : "Load more"}
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BuildingCard({ building }: { building: BuildingData }) {
  return (
    <Card className="border">
      <CardContent className="pt-4">
        <div className="flex items-start gap-4">
          <div className="relative h-16 w-16 shrink-0 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
            {building.image_url ? (
              <Image src={building.image_url} alt="" fill className="object-cover" sizes="64px" />
            ) : (
              <Building2 className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">{building.name}</h3>
            {building.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{building.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              {building.floor_count && (
                <span className="flex items-center gap-1">
                  <span>🏢</span> {building.floor_count} floors
                </span>
              )}
              {building.latitude && building.longitude && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {building.latitude.toFixed(4)}, {building.longitude.toFixed(4)}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ClubCard({ club }: { club: ClubData }) {
  return (
    <Card className="border">
      <CardContent className="pt-4">
        <div className="flex items-start gap-4">
          <div className="relative h-16 w-16 shrink-0 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
            {club.image_url ? (
              <Image src={club.image_url} alt="" fill className="object-cover" sizes="64px" />
            ) : (
              <Users className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{club.name}</h3>
              {club.is_official && <Badge variant="default" className="text-xs">Official</Badge>}
              {club.category && <Badge variant="secondary" className="text-xs">{club.category}</Badge>}
            </div>
            {club.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{club.description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}