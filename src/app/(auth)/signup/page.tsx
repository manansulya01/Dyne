import { Metadata } from "next";
import SignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign up - Dyne",
  description: "Create your Dyne campus network account",
};

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4 py-12">
      <SignupForm />
    </div>
  );
}