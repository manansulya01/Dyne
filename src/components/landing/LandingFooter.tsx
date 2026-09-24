import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-zinc-950" aria-label="Footer">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="text-xl font-extrabold tracking-tight text-white">Dyne</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">
            Your campus, your community, your connection — the private social network for Macro Vision Academy.
          </p>
        </div>
        <nav aria-label="Product">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Product</p>
          <ul className="mt-3 space-y-2.5 text-sm text-zinc-300">
            <li><Link className="hover:text-white" href="/about">About</Link></li>
            <li><Link className="hover:text-white" href="/blogs">Blogs</Link></li>
            <li><Link className="hover:text-white" href="/feed">Home</Link></li>
            <li><Link className="hover:text-white" href="/explore">Explore</Link></li>
          </ul>
        </nav>
        <nav aria-label="Campus">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Campus</p>
          <ul className="mt-3 space-y-2.5 text-sm text-zinc-300">
            <li><Link className="hover:text-white" href="/communities">Communities</Link></li>
            <li><Link className="hover:text-white" href="/events">Events</Link></li>
            <li><Link className="hover:text-white" href="/mva-events">MVA events</Link></li>
            <li><Link className="hover:text-white" href="/campus">Campus guide</Link></li>
          </ul>
        </nav>
        <nav aria-label="Account">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Account</p>
          <ul className="mt-3 space-y-2.5 text-sm text-zinc-300">
            <li><Link className="hover:text-white" href="/login">Log in</Link></li>
            <li><Link className="hover:text-white" href="/signup">Join Dyne</Link></li>
            <li><Link className="hover:text-white" href="/settings">Settings</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-zinc-500 sm:px-6">
          Dyne · Macro Vision Academy · Your campus, your community, your connection.
        </p>
      </div>
    </footer>
  );
}
