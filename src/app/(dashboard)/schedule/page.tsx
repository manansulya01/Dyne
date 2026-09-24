import type { Metadata } from "next";
import { ScheduleClient } from "./ScheduleClient";

export const metadata: Metadata = { title: "Schedule — Dyne", description: "Today's schedule, upcoming events, classes, and campus timings." };
export default function SchedulePage() {
  return <ScheduleClient />;
}
