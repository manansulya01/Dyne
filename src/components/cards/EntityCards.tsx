import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { Calendar, MapPin, Users } from "lucide-react";
import { format, parseISO } from "date-fns";

export interface CardUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role?: string | null;
  bio?: string | null;
}

export function UserCard({ user, action }: { user: CardUser; action?: React.ReactNode }) {
  return (
    <div className="dyne-card dyne-card-hover flex items-center gap-3 p-4">
      <Link href={`/profile/${user.username}`} className="flex min-w-0 flex-1 items-center gap-3" aria-label={`View ${user.display_name || user.username}'s profile`}>
        <Avatar className="h-11 w-11 shrink-0">
          <AvatarImage src={user.avatar_url || ""} alt="" />
          <AvatarFallback name={user.display_name || user.username} />
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{user.display_name || user.username}</span>
          <span className="block truncate text-xs text-muted-foreground">@{user.username}</span>
          {user.bio && <span className="dyne-line-2 mt-0.5 block text-xs text-muted-foreground">{user.bio}</span>}
        </span>
      </Link>
      {action}
    </div>
  );
}

export interface CardCommunity {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  member_count?: number;
  is_member?: boolean;
}

export function CommunityCard({ community, action }: { community: CardCommunity; action?: React.ReactNode }) {
  return (
    <Link href={`/communities/${community.slug}`} className="dyne-card dyne-card-hover block p-4" aria-label={`Open ${community.name}`}>
      <span className="flex items-center gap-3">
        <Avatar className="h-11 w-11 shrink-0 rounded-xl">
          <AvatarImage src={community.image_url || ""} alt="" />
          <AvatarFallback name={community.name} />
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{community.name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {community.member_count ?? 0} members
          </span>
        </span>
        {community.is_member && <Badge variant="secondary">Joined</Badge>}
      </span>
      {community.description && <span className="dyne-line-2 mt-2 block text-sm text-muted-foreground">{community.description}</span>}
      {action && <span className="mt-3 block" onClick={(e) => e.preventDefault()}>{action}</span>}
    </Link>
  );
}

export interface CardEvent {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  start_time: string;
  end_time: string;
  attendee_count?: number;
  location_name?: string | null;
  user_rsvp?: string | null;
}

export function EventCard({ event, footer }: { event: CardEvent; footer?: React.ReactNode }) {
  return (
    <Link href={`/events/${event.id}`} className="dyne-card dyne-card-hover block overflow-hidden" aria-label={`Open ${event.title}`}>
      {event.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.image_url} alt="" className="h-36 w-full object-cover" loading="lazy" />
      )}
      <span className="block p-4">
        <span className="block text-[15px] font-semibold tracking-tight">{event.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            {format(parseISO(event.start_time), "EEE, MMM d · h:mm a")}
          </span>
          {event.location_name && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {event.location_name}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {event.attendee_count ?? 0} going
          </span>
        </span>
        {event.description && <span className="dyne-line-2 mt-2 block text-sm text-muted-foreground">{event.description}</span>}
        {footer && <span className="mt-3 block">{footer}</span>}
      </span>
    </Link>
  );
}

export function MediaTile({ url, mediaType, alt }: { url: string; mediaType: "image" | "video"; alt: string }) {
  if (mediaType === "video") {
    return <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" aria-label={alt} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="h-full w-full object-cover" loading="lazy" />;
}

export function MessageBubble({ mine, content, time, senderName }: { mine: boolean; content: string | null; time: string; senderName?: string }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-card"
        }`}
      >
        {!mine && senderName && <p className="mb-0.5 text-xs font-semibold opacity-70">{senderName}</p>}
        {content && <p className="whitespace-pre-wrap break-words">{content}</p>}
        <p className={`mt-1 text-[11px] ${mine ? "opacity-70" : "text-muted-foreground"}`}>
          <time>{formatRelativeTime(time)}</time>
        </p>
      </div>
    </div>
  );
}
