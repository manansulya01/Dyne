import type { Metadata } from "next";
import { CoursesClient } from "./CoursesClient";

export const metadata: Metadata = {
  title: "Courses - Dyne",
  description: "Your subjects in one place",
};

export default function CoursesPage() {
  return <CoursesClient />;
}
