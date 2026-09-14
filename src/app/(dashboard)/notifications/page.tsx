import type { Metadata } from "next";
import { NotificationsPageClient } from "./NotificationsPageClient";

export const metadata: Metadata = {
  title: "Notifications — Dyne",
  description: "Your Dyne notifications.",
};

export default function NotificationsPage() {
  return <NotificationsPageClient />;
}
