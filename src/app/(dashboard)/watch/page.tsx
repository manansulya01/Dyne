import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Dyne Watch — Dyne",
  description: "Dyne Watch now lives at Dyne Videos.",
};

/**
 * `/watch` is the legacy horizontal-video route. The canonical home for
 * landscape campus video is `/videos`; short vertical clips live at `/reels`.
 * The redirect keeps old links working without duplicating the experience.
 */
export default function WatchPage() {
  redirect("/videos");
}
