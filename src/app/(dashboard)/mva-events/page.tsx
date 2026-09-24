import type { Metadata } from "next";
import { MvaEventsClient } from "./MvaEventsClient";

export const metadata: Metadata = { title: "Upcoming MVA events — Dyne", description: "Featured and upcoming Macro Vision Academy events with RSVP." };
export default function MvaEventsPage() {
  return <MvaEventsClient />;
}
