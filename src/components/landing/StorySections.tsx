import Link from "next/link";
import {
  Building2, Calendar, MessagesSquare, Sparkles, Users, Video, BookOpen,
  Newspaper, ArrowRight, Hash, Pin, Search,
} from "lucide-react";

/**
 * Continuous landing narrative: Hero → Campus → People → Communities →
 * Conversations → Events → Study → Watch → Blogs → Connection → CTA.
 * Each chapter flows into the next; no generic feature-card grids.
 */

interface Chapter {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  icon: typeof Users;
  accent: string;
  cta?: { label: string; href: string };
}

const CHAPTERS: Chapter[] = [
  {
    id: "campus",
    index: "01",
    eyebrow: "Campus",
    title: "Your whole academy, in one place",
    body: "Buildings, clubs, schedules, and timetables — the living map of Macro Vision Academy. Dyne starts where your day starts: knowing where to be and what's on.",
    points: ["Campus guide with buildings and clubs", "Timetable with current-period highlight", "Schedule, calendar, and announcements"],
    icon: Building2,
    accent: "text-cyan-300",
  },
  {
    id: "people",
    index: "02",
    eyebrow: "People",
    title: "Find your people from day one",
    body: "Discover classmates by interests and profile tags, follow friends and clubs, and build your campus circle — all inside a private MVA-only network.",
    points: ["Interest tags and people discovery", "Follow classmates and clubs", "Rich, expressive profiles"],
    icon: Sparkles,
    accent: "text-sky-300",
  },
  {
    id: "communities",
    index: "03",
    eyebrow: "Communities",
    title: "Every class, club, and interest has a home",
    body: "Course groups, societies, and hobby circles with channels, rules, pinned discussions, polls, and roles from member to owner. Moderators keep each space welcoming.",
    points: ["Channels for every topic", "Rules, pins, polls, and roles", "Member → moderator → admin → owner"],
    icon: Users,
    accent: "text-violet-300",
  },
  {
    id: "conversations",
    index: "04",
    eyebrow: "Conversations",
    title: "Chat that lives inside your communities",
    body: "Group conversations scoped to communities and channels — with mentions, reactions, attachments, and unread tracking. No stranger DMs, ever: students talk where they belong.",
    points: ["Community and channel group chats", "Mentions, reactions, attachments", "No student-to-student DMs by design"],
    icon: MessagesSquare,
    accent: "text-emerald-300",
  },
  {
    id: "events",
    index: "05",
    eyebrow: "Events",
    title: "Never miss what's happening",
    body: "Fests, workshops, matches, and meetups with venues, capacity, attendee lists, and one-tap RSVP. Organizers get real tools; everyone else just shows up.",
    points: ["Campus event discovery", "One-tap RSVP with fair capacity", "Venues, organizers, and reminders"],
    icon: Calendar,
    accent: "text-amber-300",
  },
  {
    id: "study",
    index: "06",
    eyebrow: "Study",
    title: "Notes worth sharing, easy to find",
    body: "A real learning hub: filter by subject, class, and topic, preview and download materials, save them for later, and report anything off. Uploads are scanned and moderated.",
    points: ["Search by subject, class, and topic", "Preview, download, and save", "Moderated, executable-free uploads"],
    icon: BookOpen,
    accent: "text-lime-300",
    cta: { label: "Explore study materials", href: "/study-materials" },
  },
];

export default function StorySections() {
  return (
    <>
      {/* Narrative chapters */}
      {CHAPTERS.map((s, i) => (
        <section
          key={s.id}
          id={s.id}
          aria-labelledby={`${s.id}-heading`}
          className="relative border-t border-white/10 bg-zinc-950"
        >
          {/* Journey connector */}
          {i > 0 && (
            <div className="pointer-events-none absolute -top-px left-1/2 hidden -translate-x-1/2 md:block" aria-hidden="true">
              <span className="block h-px w-40 bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
            </div>
          )}
          <div
            className={`mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-2 ${
              i % 2 === 1 ? "" : ""
            }`}
          >
            <div className={i % 2 === 1 ? "lg:order-2" : ""}>
              <p className="mb-3 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
                <span className="text-zinc-600">{s.index}</span> {s.eyebrow}
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
              {s.cta && (
                <Link
                  href={s.cta.href}
                  className="mt-6 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200"
                >
                  {s.cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
            </div>
            <div
              className={`flex min-h-[280px] items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-10 ${i % 2 === 1 ? "lg:order-1" : ""}`}
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
            <span className="mr-3 text-zinc-600">07</span> Dyne Watch
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

      {/* Blogs + connection band */}
      <section
        id="blogs"
        aria-labelledby="blogs-heading"
        className="border-t border-white/10 bg-zinc-950"
      >
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
                <span className="mr-3 text-zinc-600">08</span> Blogs
              </p>
              <h2 id="blogs-heading" className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-tight tracking-tight text-white">
                The campus publication
              </h2>
              <p className="mt-4 max-w-lg text-[clamp(1rem,2vw,1.125rem)] leading-relaxed text-zinc-400">
                Featured stories, announcements, and student writing — with drafts, publishing
                workflows, categories, and related reading. MVA news, written by MVA.
              </p>
              <ul className="mt-6 space-y-3">
                {["Featured articles and categories", "Draft → publish editorial flow", "Reading time and related stories"].map((p) => (
                  <li key={p} className="flex items-start gap-3 text-zinc-200">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-current text-cyan-300" aria-hidden="true" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-3" aria-hidden="true">
              {[
                { icon: Newspaper, tint: "text-cyan-300" },
                { icon: Pin, tint: "text-violet-300" },
                { icon: Hash, tint: "text-emerald-300" },
                { icon: Search, tint: "text-amber-300" },
              ].map((r, i) => (
                <div key={i} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <r.icon className={`h-6 w-6 ${r.tint}`} strokeWidth={1.5} />
                  <div className="h-2.5 flex-1 rounded-full bg-white/10" />
                  <div className="h-2.5 w-16 rounded-full bg-white/10" />
                </div>
              ))}
            </div>
          </div>

          {/* Connection close */}
          <div className="mt-20 rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/10 via-transparent to-violet-400/10 p-8 text-center sm:p-12">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
              <span className="mr-3 text-zinc-600">09</span> Connection
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-[clamp(1.5rem,3.5vw,2.25rem)] font-extrabold leading-tight tracking-tight text-white">
              Your Campus. Your Community. Your Connection.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-zinc-400">
              One private network for everything MVA — classes, clubs, chats, events, study, and stories.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-cyan-400 px-8 text-base font-semibold text-zinc-950 hover:bg-cyan-300"
              >
                Join Dyne <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-white/25 bg-white/5 px-8 text-base font-semibold text-white hover:bg-white/15"
              >
                Log in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
