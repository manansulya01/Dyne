import type { Metadata } from "next";
import { StudySessionsClient } from "./StudySessionsClient";

export const metadata: Metadata = {
  title: "Study Sessions - Dyne",
  description: "Track focused study time",
};

export default function StudySessionsPage() {
  return <StudySessionsClient />;
}
