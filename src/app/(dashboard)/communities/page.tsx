import { Metadata } from "next";
import { CommunitiesPageClient } from "./CommunitiesPageClient";

export const metadata: Metadata = {
  title: "Communities - Dyne",
  description: "Discover and join communities on Dyne",
};

export default async function CommunitiesPage() {
  return <CommunitiesPageClient />;
}
