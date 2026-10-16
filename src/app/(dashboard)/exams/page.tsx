import type { Metadata } from "next";
import { ExamsClient } from "./ExamsClient";

export const metadata: Metadata = {
  title: "Exams - Dyne",
  description: "Exam dates and preparation",
};

export default function ExamsPage() {
  return <ExamsClient />;
}
