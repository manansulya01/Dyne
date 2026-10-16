import type { Metadata } from "next";
import { TasksClient } from "./TasksClient";

export const metadata: Metadata = {
  title: "Tasks - Dyne",
  description: "Your personal task list",
};

export default function TasksPage() {
  return <TasksClient />;
}
