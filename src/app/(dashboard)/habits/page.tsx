import type { Metadata } from "next";
import { HabitsClient } from "./HabitsClient";

export const metadata: Metadata = {
  title: "Habits - Dyne",
  description: "Build streaks that stick",
};

export default function HabitsPage() {
  return <HabitsClient />;
}
