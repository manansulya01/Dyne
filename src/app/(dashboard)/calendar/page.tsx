import type { Metadata } from "next";
import { CalendarClient } from "./CalendarClient";

export const metadata: Metadata = { title: "Calendar — Dyne", description: "Unified campus calendar: classes, events, and important dates." };
export default function CalendarPage() {
  return <CalendarClient />;
}
