import type { Metadata } from "next";
import { AnalyticsClient } from "./AnalyticsClient";

export const metadata: Metadata = {
  title: "Analytics - Dyne",
  description: "Your real study footprint",
};

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
