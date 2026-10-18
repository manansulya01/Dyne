import type { Metadata } from "next";
import { StaffLoginForm } from "@/components/auth/StaffLoginForm";

export const metadata: Metadata = {
  title: "Teacher Sign In | Dyne",
  description: "Secure sign in for Macro Vision Academy teachers on Dyne.",
};

export const dynamic = "force-dynamic";

export default function TeacherLoginPage() {
  return <StaffLoginForm portal="teacher" />;
}
