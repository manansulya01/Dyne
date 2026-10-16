import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Deep link for the dashboard quick action. */
export default function NewExamPage() {
  redirect("/teacher/exams");
}
