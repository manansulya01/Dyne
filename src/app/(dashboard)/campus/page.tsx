import { Metadata } from "next";
import { CampusPageClient } from "./CampusPageClient";

export const metadata: Metadata = {
  title: "Campus - Dyne",
  description: "Explore campus buildings and clubs",
};

export default function CampusPage() {
  return <CampusPageClient />;
}