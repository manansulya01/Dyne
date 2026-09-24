import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import Hero from "@/components/landing/Hero";
import StorySections from "@/components/landing/StorySections";
import EcosystemSections from "@/components/landing/EcosystemSections";
import WatchCta from "@/components/landing/WatchCta";
import LandingFooter from "@/components/landing/LandingFooter";

export const metadata: Metadata = {
  title: "Dyne — Your Campus, Your Community, Your Connection",
  description:
    "Dyne is the private campus social network for Macro Vision Academy. Connect with classmates, join communities, discover events, chat in realtime, and share campus life.",
  openGraph: {
    title: "Dyne — Your Campus, Your Community, Your Connection",
    description:
      "The private social network for Macro Vision Academy: feed, communities, chat, events, campus guide, and Dyne Watch.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Dyne — Your Campus, Your Community, Your Connection",
    description:
      "The private social network for Macro Vision Academy: feed, communities, chat, events, campus guide, and Dyne Watch.",
  },
};

/**
 * Public landing page — always rendered for logged-out AND logged-in
 * visitors. Authenticated app routes live under (dashboard) and /home.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <a
        href="#main"
        className="sr-only z-[60] rounded bg-cyan-400 px-4 py-2 font-medium text-zinc-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <LandingNav />
      <main id="main">
        <Hero />
        <StorySections />
        <EcosystemSections />
        <WatchCta />
      </main>
      <LandingFooter />
    </div>
  );
}
