import type { Metadata } from "next";
import { StaffLoginForm } from "@/components/auth/StaffLoginForm";

export const metadata: Metadata = {
  title: "Administrator Sign In | Dyne",
  description: "Secure administrator sign in for Dyne.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return <StaffLoginForm portal="admin" />;
}
