import type { Metadata } from "next";
import { FeedbackClient } from "./FeedbackClient";

export const metadata: Metadata = {
  title: "Feedback — Dyne",
  description: "Report bugs, request features, and track your feedback.",
};

export default function FeedbackPage() {
  return <FeedbackClient />;
}
