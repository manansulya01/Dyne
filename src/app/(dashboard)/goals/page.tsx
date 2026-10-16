import type { Metadata } from "next";
import { GoalsClient } from "./GoalsClient";

export const metadata: Metadata = {
  title: "Goals - Dyne",
  description: "Set targets and track progress",
};

export default function GoalsPage() {
  return <GoalsClient />;
}
