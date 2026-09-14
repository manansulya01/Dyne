import type { Metadata } from "next";
import { WatchPageClient } from "./WatchPageClient";

export const metadata: Metadata = {
  title: "Dyne Watch — Dyne",
  description: "Campus videos: lectures, events, and creativity on Dyne Watch.",
};

export default function WatchPage() {
  return <WatchPageClient />;
}
