import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function WatchCta() {
  return (
    <>
      <section
        aria-labelledby="join-heading"
        className="border-t border-white/10 bg-zinc-950"
      >
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 md:py-28">
          <h2
            id="join-heading"
            className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-tight tracking-tight text-white"
          >
            Ready to join
            <br />
            your campus network?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[clamp(1rem,2vw,1.125rem)] leading-relaxed text-zinc-400">
            Sign up with your MVA email address and start connecting today. Your campus. Your
            community. Your network.
          </p>
          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            {/* asChild keeps one focusable element: nesting <button> inside <a>
                produced invalid HTML and a double tab stop. */}
            <Button asChild size="lg">
              <Link
                href="/signup"
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 bg-cyan-400 text-base text-zinc-950 hover:bg-cyan-300 focus-visible:ring-cyan-200 sm:w-auto sm:px-8"
              >
                Join Dyne <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link
                href="/login"
                className="inline-flex min-h-[48px] w-full items-center justify-center border-white/25 bg-transparent text-base text-white hover:bg-white/10 hover:text-white focus-visible:ring-cyan-200 sm:w-auto sm:px-8"
              >
                Log in
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
