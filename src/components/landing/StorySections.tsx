import { Building2, Calendar, MessageSquare, Sparkles, Users, Video } from "lucide-react";

interface Story {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  icon: typeof Users;
  accent: string;
}

const STORIES: Story[] = [
  {
    id: "explore",
    eyebrow: "Discovery",
    title: "Find your people from day one",
    body: "Search across people, posts, communities, events, and videos. Your campus directory, social feed, and noticeboard finally live in one network.",
    points: ["People and profile discovery", "Unified campus-wide search", "Follow classmates and clubs"],
    icon: Sparkles,
    accent: "text-cyan-300",
  },
  {
    id: "feed",
    eyebrow: "Social feed",
    title: "The pulse of campus life",
    body: "Share posts and photos, react, comment, and save what matters. Every conversation stays inside your private MVA community.",
    points: ["Posts with media", "Likes, comments, and saves", "Private to your academy"],
    icon: Users,
    accent: "text-sky-300",
  },
  {
    id: "communities",
    eyebrow: "Communities",
    title: "Every class, club, and interest has a home",
    body: "Join course groups, societies, and hobby circles. Moderators keep each space welcoming while members shape the conversation.",
    points: ["Course and club spaces", "Member roles and moderation", "Community announcements"],
    icon: MessageSquare,
    accent: "text-violet-300",
  },
  {
    id: "conversations",
    eyebrow: "Conversations",
    title: "Chat that keeps up with you",
    body: "Direct messages and group conversations with read states and attachments. Coordinate projects, plan nights out, stay close.",
    points: ["Direct and group messaging", "File attachments", "Unread tracking"],
    icon: MessageSquare,
    accent: "text-emerald-300",
  },
  {
    id: "events",
    eyebrow: "Events",
    title: "Never miss what's happening",
    body: "Discover fests, workshops, matches, and meetups. RSVP in one tap and see who's going — with capacity handled fairly.",
    points: ["Campus event discovery", "One-tap RSVP with counts", "Organizer tools"],
    icon: Calendar,
    accent: "text-amber-300",
  },
  {
    id: "campus",
    eyebrow: "Campus",
    title: "Know every corner of MVA",
    body: "Explore buildings, facilities, and clubs with a living campus guide maintained for students, by the campus.",
    points: ["Building directory", "Club listings", "Campus information"],
    icon: Building2,
    accent: "text-rose-300",
  },
];

export default function StorySections() {
  return (
    <>
      {STORIES.map((s, i) => (
        <section
          key={s.id}
          id={s.id}
          aria-labelledby={`${s.id}-heading`}
          className="border-t border-white/10 bg-zinc-950"
        >
          <div
            className={`mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-2 ${
              i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
            }`}
          >
            <div>
              <p className={`mb-3 text-xs font-bold uppercase tracking-[0.22em] ${s.accent}`}>
                {s.eyebrow}
              </p>
              <h2
                id={`${s.id}-heading`}
                className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-tight tracking-tight text-white"
              >
                {s.title}
              </h2>
              <p className="mt-4 max-w-lg text-[clamp(1rem,2vw,1.125rem)] leading-relaxed text-zinc-400">
                {s.body}
              </p>
              <ul className="mt-6 space-y-3">
                {s.points.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-zinc-200">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full bg-current ${s.accent}`} aria-hidden="true" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div
              className="flex min-h-[280px] items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-10"
              aria-hidden="true"
            >
              <s.icon className={`h-24 w-24 ${s.accent}`} strokeWidth={1.25} />
            </div>
          </div>
        </section>
      ))}
      {/* Dyne Watch band */}
      <section
        id="watch"
        aria-labelledby="watch-heading"
        className="border-t border-white/10 bg-gradient-to-b from-zinc-950 via-[#0b1626] to-zinc-950"
      >
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 md:py-28">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
            Dyne Watch
          </p>
          <h2
            id="watch-heading"
            className="mx-auto max-w-3xl text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-tight tracking-tight text-white"
          >
            Campus stories, in motion
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[clamp(1rem,2vw,1.125rem)] leading-relaxed text-zinc-400">
            Lectures, event highlights, club films, and student creativity — Dyne Watch is the video
            stage for everything happening across Macro Vision Academy.
          </p>
          <div className="mx-auto mt-10 flex max-w-3xl items-center justify-center gap-4" aria-hidden="true">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <Video className="h-8 w-8 text-cyan-300" strokeWidth={1.5} />
            </span>
            <span className="hidden h-px flex-1 bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent sm:block" />
            <span className="flex h-20 w-20 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10">
              <Video className="h-10 w-10 text-cyan-200" strokeWidth={1.5} />
            </span>
            <span className="hidden h-px flex-1 bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent sm:block" />
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <Video className="h-8 w-8 text-violet-300" strokeWidth={1.5} />
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
