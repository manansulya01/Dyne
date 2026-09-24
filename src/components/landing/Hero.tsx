import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import CampusScene from "./CampusScene";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-zinc-950" aria-labelledby="dyne-hero-heading">
      {/* 3D campus backdrop */}
      <div className="absolute inset-0">
        <CampusScene />
      </div>
      {/* legibility gradients */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950/80 via-zinc-950/35 to-zinc-950" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-zinc-950/70 via-transparent to-zinc-950/40" />

      <div className="pointer-events-none relative mx-auto flex min-h-[92svh] max-w-6xl flex-col items-center justify-center px-4 pb-24 pt-32 text-center sm:px-6">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
          Macro Vision Academy
        </p>
        <h1
          id="dyne-hero-heading"
          className="max-w-4xl text-[clamp(2.5rem,7vw,5.25rem)] font-extrabold leading-[1.04] tracking-tight text-white"
        >
          Your Campus.
          <br />
          <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 bg-clip-text text-transparent">
            Your Community.
          </span>
          <br />
          Your Connection.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[clamp(1rem,2.4vw,1.25rem)] leading-relaxed text-zinc-300">
          Dyne is the private social network for Macro Vision Academy. Connect with classmates, join
          communities, discover events, and share your campus life — all in one place.
        </p>
        <div className="pointer-events-auto mt-10 flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
          <Link href="/signup">
            <Button
              size="lg"
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 bg-cyan-400 text-base text-zinc-950 hover:bg-cyan-300 focus-visible:ring-cyan-200 sm:w-auto sm:px-8"
            >
              Join Dyne <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Button>
          </Link>
          <Link href="/login">
            <Button
              size="lg"
              variant="outline"
              className="inline-flex min-h-[48px] w-full items-center justify-center border-white/25 bg-white/5 text-base text-white backdrop-blur hover:bg-white/15 hover:text-white focus-visible:ring-cyan-200 sm:w-auto sm:px-8"
            >
              Log in
            </Button>
          </Link>
        </div>
        <p className="mt-6 text-sm text-zinc-400">
          Free for every MVA student — sign up with your campus email.
        </p>
      </div>
    </section>
  );
}
