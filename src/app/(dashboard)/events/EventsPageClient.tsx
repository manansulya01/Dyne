"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Calendar, MapPin, Users, Plus, Check, Heart } from "lucide-react";
import { format, parseISO, isBefore } from "date-fns";

interface EventData {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  location_id: string | null;
  start_time: string;
  end_time: string;
  organizer_id: string;
  is_public: boolean;
  max_attendees: number | null;
  created_at: string;
  organizer: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  location: {
    id: string;
    name: string;
  } | null;
  attendee_count: number;
  is_organizer: boolean;
  user_rsvp: "going" | "interested" | "declined" | null;
}

interface EventsPageClientProps {
  currentUserId: string | null;
}

export function EventsPageClient({ currentUserId }: EventsPageClientProps) {
  const [activeTab, setActiveTab] = useState("upcoming");
  const [allEvents, setAllEvents] = useState<EventData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // Fetch a generous page; tab filtering happens client-side below.
      const response = await fetch("/api/events?limit=50");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load events");
      setAllEvents(data.events ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load events");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial events load only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEvents();
  }, [fetchEvents]);

  const now = new Date();
  const visibleEvents =
    activeTab === "upcoming"
      ? allEvents.filter((e) => !isBefore(parseISO(e.start_time), now))
      : activeTab === "past"
        ? allEvents.filter((e) => isBefore(parseISO(e.start_time), now))
        : allEvents.filter((e) => e.is_organizer || e.organizer_id === currentUserId);

  const handleRSVP = async (eventId: string, status: "going" | "interested" | "declined") => {
    if (!currentUserId) return;

    const prev = allEvents;
    setAllEvents((events) => events.map((e) =>
      e.id === eventId ? { ...e, user_rsvp: status === "declined" ? null : status } : e
    ));

    try {
      const response = await fetch(`/api/events/${eventId}/attendees`, {
        method: status === "declined" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) setAllEvents(prev);
    } catch (error) {
      console.error("Failed to RSVP:", error);
      setAllEvents(prev);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Events</h1>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Event
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upcoming" className="min-h-[44px]">Upcoming</TabsTrigger>
          <TabsTrigger value="past" className="min-h-[44px]">Past</TabsTrigger>
          <TabsTrigger value="my-events" className="min-h-[44px]">My Events</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading && (
            <div className="flex justify-center py-12" role="status" aria-label="Loading events">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          )}
          {loadError && <p role="alert" className="text-center text-sm text-destructive py-8">{loadError}</p>}
          {!isLoading && !loadError && (
            <EventList events={visibleEvents} currentUserId={currentUserId} onRSVP={handleRSVP} />
          )}
        </TabsContent>
      </Tabs>

      {showCreateModal && (
        <CreateEventModal onClose={() => { setShowCreateModal(false); fetchEvents(); }} />
      )}
    </div>
  );
}

function EventList({ events, currentUserId, onRSVP }: { events: EventData[]; currentUserId: string | null; onRSVP: (id: string, status: "going" | "interested" | "declined") => void }) {
  if (events.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No events found</p>;
  }

  return (
    <div className="space-y-4">
      {events.map(event => (
        <EventCard key={event.id} event={event} currentUserId={currentUserId} onRSVP={onRSVP} />
      ))}
    </div>
  );
}

function EventCard({ event, currentUserId, onRSVP }: { event: EventData; currentUserId: string | null; onRSVP: (id: string, status: "going" | "interested" | "declined") => void }) {
  const isPast = isBefore(parseISO(event.end_time), new Date());
  const isOrganizer = event.is_organizer;
  const userRsvp = event.user_rsvp;

  const handleRSVPClick = (status: "going" | "interested" | "declined") => {
    if (!currentUserId) return;
    onRSVP(event.id, status);
  };

  return (
    <Card className="border hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">{event.title}</CardTitle>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {format(parseISO(event.start_time), "EEE, MMM d")} · {format(parseISO(event.start_time), "h:mm a")} - {format(parseISO(event.end_time), "h:mm a")}
              </span>
              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {event.location.name}
                </span>
              )}
            </div>
          </div>
          {event.image_url && (
            <div className="relative h-20 w-32 shrink-0 rounded-lg overflow-hidden">
              <Image src={event.image_url} alt="" fill className="object-cover" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {event.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{event.description}</p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {event.attendee_count} going
            </span>
            {event.max_attendees && (
              <Badge variant="secondary" className="text-xs">
                {event.attendee_count}/{event.max_attendees}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isOrganizer ? (
              <Badge variant="outline" className="text-xs">Organizer</Badge>
            ) : userRsvp ? (
              <Badge variant="default" className="text-xs capitalize">{userRsvp}</Badge>
            ) : !isPast && (
              <>
                <Button variant="outline" size="sm" onClick={() => handleRSVPClick("going")}>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Going
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleRSVPClick("interested")}>
                  <Heart className="h-3.5 w-3.5 mr-1" />
                  Interested
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateEventModal({ onClose }: { onClose: () => void }) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    locationId: "",
    startTime: "",
    endTime: "",
    isPublic: true,
    maxAttendees: "",
  });
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/campus/buildings?limit=100")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.buildings) setBuildings(data.buildings);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      const toISO = (v: string) => (v ? new Date(v).toISOString() : "");
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || undefined,
          locationId: formData.locationId || undefined,
          startTime: toISO(formData.startTime),
          endTime: toISO(formData.endTime),
          isPublic: formData.isPublic,
          maxAttendees: formData.maxAttendees ? parseInt(formData.maxAttendees) : undefined,
        }),
      });

      const data = await response.json();

      if (data.event) {
        onClose();
      } else if (response.status === 403) {
        setFormError("Only teachers, staff, clubs, and admins can create events.");
      } else {
        const firstError =
          typeof data.error === "string"
            ? data.error
            : data.error?._form?.[0] || Object.values(data.error ?? {})[0] || "Failed to create event";
        setFormError(Array.isArray(firstError) ? firstError[0] : String(firstError));
      }
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Create Event</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              className="w-full p-2 border rounded-md"
              required
              maxLength={200}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description (optional)</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-2 border rounded-md"
              rows={3}
              maxLength={5000}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Start Time</label>
              <input
                type="datetime-local"
                name="startTime"
                value={formData.startTime}
                onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                className="w-full p-2 border rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Time</label>
              <input
                type="datetime-local"
                name="endTime"
                value={formData.endTime}
                onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                className="w-full p-2 border rounded-md"
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="event-location" className="block text-sm font-medium mb-1">Location (optional)</label>
            <select
              id="event-location"
              value={formData.locationId}
              onChange={e => setFormData({ ...formData, locationId: e.target.value })}
              className="w-full p-2 border rounded-md min-h-[44px] bg-background"
            >
              <option value="">No specific building</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Max Attendees (optional)</label>
              <input
                type="number"
                name="maxAttendees"
                value={formData.maxAttendees}
                onChange={e => setFormData({ ...formData, maxAttendees: e.target.value })}
                className="w-full p-2 border rounded-md"
                min="1"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="isPublic"
                checked={formData.isPublic}
                onChange={e => setFormData({ ...formData, isPublic: e.target.checked })}
                id="isPublic"
                className="rounded"
              />
              <label htmlFor="isPublic" className="text-sm">Public event</label>
            </div>
          </div>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Event"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}