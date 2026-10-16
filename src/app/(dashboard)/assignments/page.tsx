import type { Metadata } from "next";
import { AssignmentsClient } from "./AssignmentsClient";

export const metadata: Metadata = {
  title: "Assignments - Dyne",
  description: "Track coursework to submission",
};

export default function AssignmentsPage() {
  return <AssignmentsClient />;
}
