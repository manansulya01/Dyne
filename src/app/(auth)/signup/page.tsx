import { Metadata } from "next";
import { redirect } from "next/navigation";
import SignupForm from "./SignupForm";
import { getDb } from "@/lib/mongo/client";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sign up - Dyne",
  description: "Create your Dyne campus network account",
};

// Session-dependent: never prerender at build time.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const db = await getDb();
  const user = await getSessionUser(db);
  if (user) redirect("/feed");

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4 py-12">
      <SignupForm />
    </div>
  );
}
