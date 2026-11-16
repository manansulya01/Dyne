import type { Metadata } from "next";
import { StaffLoginForm } from "@/components/auth/StaffLoginForm";

export const metadata: Metadata = {
  title: "Staff Sign In | Dyne",
  description: "Secure sign in for authorized Macro Vision Academy staff on Dyne.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function StaffLoginPage() {
  return <StaffLoginForm portal="staff" />;
}
