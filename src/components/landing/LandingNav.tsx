"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

const LINKS = [
  { label: "Explore", href: "#explore" },
  { label: "Communities", href: "#communities" },
  { label: "Campus", href: "#campus" },
  { label: "Stories", href: "/blogs" },
  { label: "About", href: "/about" },
];

export default function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-zinc-950/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="rounded text-lg font-extrabold tracking-[0.22em] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          aria-label="Dyne home"
        >
          DYNE
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login">
            <Button
              variant="ghost"
              className="text-zinc-200 hover:bg-white/10 hover:text-white focus-visible:ring-cyan-300"
            >
              Log in
            </Button>
          </Link>
          <Link href="/signup">
            <Button className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300 focus-visible:ring-cyan-200">
              Join Dyne
            </Button>
          </Link>
        </div>
        <button
          type="button"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-zinc-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 md:hidden"
          aria-expanded={open}
          aria-controls="landing-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <nav id="landing-menu" className="border-t border-white/10 px-4 pb-6 pt-2 md:hidden" aria-label="Mobile">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block min-h-[44px] rounded px-2 py-3 text-base font-medium text-zinc-200 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-3 flex flex-col gap-2">
            <Link href="/login" onClick={() => setOpen(false)}>
              <Button variant="outline" className="w-full border-white/20 bg-transparent text-white hover:bg-white/10">
                Log in
              </Button>
            </Link>
            <Link href="/signup" onClick={() => setOpen(false)}>
              <Button className="w-full bg-cyan-400 text-zinc-950 hover:bg-cyan-300">Join Dyne</Button>
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
