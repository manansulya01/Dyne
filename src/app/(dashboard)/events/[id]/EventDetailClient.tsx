"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, MapPin, Users, Check, Heart, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { format, parseISO } from "date-fns";

interface Props {
  event: {
    id: string;
    title: string;
    description: string | null;
    image_url: string | null;
    start_time: string;
    end_time: string;
    is_public: boolean;
    max_attendees: number | null;
    going_count: number;
    interested_count: number;
    user_rsvp: "going" | "interested" | "declined" | null;
    is_organizer: boolean;
    organizer: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
    location: { id: string; name: string } | null;
    attendees: Array<{ id?: string; username?: string; display_name?: string | null; avatar_url?: string | null }>;
  };
}

export function EventDetailClient({ event }: Props) {
  const [rsvp, setRsvp] = useState(event.user_rsvp);
  const [going, setGoing] = useState(event.going_count);

  const doRsvp = async (status: "going" | "interested" | "declined") => {
    const prev = rsvp;
    const prevGoing = going;
    setRsvp(status === "declined" ? null : status);
    if (status === "going") setGoing((g) => g + (prev === "going" ? 0 : 1));
    if (prev === "going" && status !== "going") setGoing((g) => Math.max(0, g - 1));
    try {
      const res = await fetch(`/api/events/${event.id}/attendees`, {
        method: status === "declined" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setRsvp(prev);
        setGoing(prevGoing);
      }
    } catch {
      setRsvp(prev);
      setGoing(prevGoing);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/events/${event.id}`;
    try {
      if (navigator.share) await navigator.share({ title: event.title, url });
      else await navigator.clipboard.writeText(url);
    } catch { /* cancelled */ }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-4">
      <Link href="/events" className="text-sm font-medium text-primary">← All events</Link>
      <article className="dyne-card mt-3 overflow-hidden">
        {event.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.image_url} alt="" className="h-56 w-full object-cover sm:h-72" />
        )}
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {!event.is_public && <Badge variant="secondary">Private</Badge>}
            {event.is_organizer && <Badge variant="outline">You organize this</Badge>}
            {rsvp && <Badge className="capitalize">{rsvp}</Badge>}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{event.title}</h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" aria-hidden="true" />{format(parseISO(event.start_time), "EEEE, MMM d · h:mm a")} — {format(parseISO(event.end_time), "h:mm a")}</span>
            {event.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden="true" />{event.location.name}</span>}
            <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden="true" />{going} going · {event.interested_count} interested</span>
          </div>
          {event.max_attendees && <p className="mt-1 text-xs text-muted-foreground">Capacity: {going}/{event.max_attendees}</p>}
          {event.description && <p className="mt-4 whitespace-pre-wrap leading-relaxed">{event.description}</p>}

          <div className="mt-5 flex flex-wrap gap-2">
            {!event.is_organizer && (
              <>
                <Button onClick={() => doRsvp("going")} variant={rsvp === "going" ? "secondary" : "default"} className="min-h-[48px]" disabled={!!event.max_attendees && going >= event.max_attendees && rsvp !== "going"}>
                  <Check className="mr-1.5 h-4 w-4" />{rsvp === "going" ? "Going ✓" : "Going"}
                </Button>
                <Button onClick={() => doRsvp("interested")} variant={rsvp === "interested" ? "secondary" : "outline"} className="min-h-[48px]">
                  <Heart className="mr-1.5 h-4 w-4" />Interested
                </Button>
                {rsvp && <Button onClick={() => doRsvp("declined")} variant="ghost" className="min-h-[48px]">Can&apos;t go</Button>}
              </>
            )}
            <Button onClick={share} variant="outline" className="min-h-[48px]" aria-label="Share event"><Share2 className="h-4 w-4" /></Button>
          </div>

          {event.organizer && (
            <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
              <Avatar className="h-10 w-10">
                <AvatarImage src={event.organizer.avatar_url || ""} alt="" />
                <AvatarFallback name={event.organizer.display_name || event.organizer.username} />
              </Avatar>
              <div>
                <p className="text-xs text-muted-foreground">Organized by</p>
                <p className="text-sm font-semibold">{event.organizer.display_name || event.organizer.username}</p>
              </div>
            </div>
          )}

          {event.attendees.length > 0 && (
            <div className="mt-4">
              <h2 className="text-sm font-bold">Who&apos;s going</h2>
              <div className="mt-2 flex -space-x-2">
                {event.attendees.slice(0, 10).map((a, i) => (
                  <Avatar key={a.id ?? i} className="h-9 w-9 border-2 border-card">
                    <AvatarImage src={a.avatar_url || ""} alt="" />
                    <AvatarFallback name={a.display_name || a.username || "?"} />
                  </Avatar>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
