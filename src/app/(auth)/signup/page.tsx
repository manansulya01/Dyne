import { Metadata } from "next";
import { redirect } from "next/navigation";
import SignupForm from "./SignupForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign up - Dyne",
  description: "Create your Dyne campus network account",
};

export default async function SignupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/feed");

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4 py-12">
      <SignupForm />
    </div>
  );
}