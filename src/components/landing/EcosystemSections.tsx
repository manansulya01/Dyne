import { Building2, CalendarDays, Clapperboard, Compass, MessagesSquare, Newspaper, CalendarClock, Users } from "lucide-react";
import Link from "next/link";

const AREAS = [
  { icon: Users, title: "People", body: "Find classmates, clubs, and collaborators.", href: "/people" },
  { icon: MessagesSquare, title: "Conversation", body: "Direct messages and group chats for campus life.", href: "/chat" },
  { icon: Compass, title: "Communities", body: "Course groups, societies, and hobby circles.", href: "/communities" },
  { icon: CalendarDays, title: "Events", body: "Fests, workshops, matches, and meetups.", href: "/events" },
  { icon: Building2, title: "Campus", body: "Buildings, clubs, and places that matter.", href: "/campus" },
  { icon: Clapperboard, title: "Watch", body: "Lectures, highlights, and student films.", href: "/watch" },
  { icon: Newspaper, title: "Blogs", body: "Stories and announcements from MVA.", href: "/blogs" },
  { icon: CalendarClock, title: "Schedule", body: "Today, this week, and what's next.", href: "/schedule" },
];

export default function EcosystemSections() {
  return (
    <section aria-labelledby="ecosystem-heading" className="border-t border-white/10 bg-zinc-950">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
          One connected campus
        </p>
        <h2 id="ecosystem-heading" className="mx-auto max-w-3xl text-center text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-tight tracking-tight text-white">
          Everything MVA does, in one place
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-[clamp(1rem,2vw,1.125rem)] leading-relaxed text-zinc-400">
          Not eight separate apps — one coherent home where posts, people, communities,
          conversations, events, videos, stories, and schedules connect.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AREAS.map((a) => (
            <Link
              key={a.title}
              href={a.href}
              className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-cyan-300/40 hover:bg-white/[0.07]"
            >
              <a.icon className="h-6 w-6 text-cyan-300" aria-hidden="true" strokeWidth={1.75} />
              <span className="mt-3 block font-bold text-white">{a.title}</span>
              <span className="mt-1 block text-sm leading-relaxed text-zinc-400">{a.body}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
