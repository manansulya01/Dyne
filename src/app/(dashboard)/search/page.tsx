import type { Metadata } from "next";
import { SearchPageClient } from "./SearchPageClient";

export const metadata: Metadata = {
  title: "Search — Dyne",
  description: "Search people, posts, communities, events, campus places, and videos on Dyne.",
};

export default function SearchPage() {
  return <SearchPageClient />;
}
