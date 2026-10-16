import type { Metadata } from "next";
import { NotesClient } from "./NotesClient";

export const metadata: Metadata = {
  title: "Notes - Dyne",
  description: "Your private study notes",
};

export default function NotesPage() {
  return <NotesClient />;
}
