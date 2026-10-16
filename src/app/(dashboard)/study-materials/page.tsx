import type { Metadata } from "next";
import { StudyMaterialsClient } from "./StudyMaterialsClient";

export const metadata: Metadata = {
  title: "Study Materials — Dyne",
  description: "Browse and share campus study materials.",
};

export default function StudyMaterialsPage() {
  return <StudyMaterialsClient />;
}
