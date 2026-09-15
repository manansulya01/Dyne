import { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in - Dyne",
  description: "Sign in to your Dyne campus network account",
};

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/feed");

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4 py-12">
      <LoginForm />
    </div>
  );
}