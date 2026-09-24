import type { Metadata } from "next";
import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { ShieldCheck, Users, CalendarDays, MessagesSquare, Clapperboard, Building2, Newspaper, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "About — Dyne",
  description: "What Dyne is, why it exists, and how it connects Macro Vision Academy. Your campus, your community, your connection.",
};

const PILLARS = [
  { icon: Users, title: "People", body: "Discover classmates, follow friends and clubs, and build your campus circle — all inside a private MVA-only network." },
  { icon: MessagesSquare, title: "Communities & conversation", body: "Course groups, societies, and hobby circles with real discussion threads, polls, and moderation — plus direct and group messaging." },
  { icon: CalendarDays, title: "Events & schedule", body: "Upcoming MVA events with honest RSVP counts, a campus schedule hub, weekly timetable, and one unified calendar." },
  { icon: Building2, title: "Campus", body: "Buildings, clubs, and useful campus information — connected to the communities and events that use them." },
  { icon: Clapperboard, title: "Watch", body: "Lectures, highlights, and student creativity on Dyne Watch, with real views, reactions, and creator profiles." },
  { icon: Newspaper, title: "Blogs & news", body: "Official MVA stories and announcements published through controlled admin workflows — never hardcoded fakes." },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <LandingNav />
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-28 sm:px-6">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> About Dyne
        </p>
        <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-tight tracking-tight">
          The digital home of<br />Macro Vision Academy.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-300">
          Dyne exists for one reason: campus life is scattered across group chats, noticeboards,
          and word of mouth. Dyne brings it together — <strong className="text-white">your campus, your community, your connection</strong> —
          in a single private network built only for MVA.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {PILLARS.map((p) => (
            <article key={p.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <p.icon className="h-7 w-7 text-cyan-300" aria-hidden="true" strokeWidth={1.75} />
              <h2 className="mt-3 text-lg font-bold">{p.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{p.body}</p>
            </article>
          ))}
        </div>

        <section aria-labelledby="safety-heading" className="mt-12 rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          <h2 id="safety-heading" className="flex items-center gap-2 text-lg font-bold">
            <ShieldCheck className="h-5 w-5 text-emerald-300" aria-hidden="true" /> Safety & moderation
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Every member is a verified part of the academy. You can report posts, comments, users,
            communities, and videos; moderators and admins review reports with recorded actions.
            Private spaces stay private, and moderation-only information is never exposed to normal users.
          </p>
        </section>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-cyan-400 px-8 font-semibold text-zinc-950 hover:bg-cyan-300">
            Join Dyne
          </Link>
          <Link href="/blogs" className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-white/20 px-8 font-semibold text-white hover:bg-white/10">
            Read campus stories
          </Link>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
