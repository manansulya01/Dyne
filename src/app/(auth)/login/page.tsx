import { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { getDb } from "@/lib/mongo/client";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sign in - Dyne",
  description: "Sign in to your Dyne campus network account",
};

// Session-dependent: never prerender at build time.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // redirect() throws a NEXT_REDIRECT signal, so it must stay outside the
  // try/catch: only database failures are suppressed (render the form anyway;
  // the API returns the actionable error on submit).
  const db = await getDb().catch(() => null);
  if (db) {
    const user = await getSessionUser(db).catch(() => null);
    if (user) redirect("/feed");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4 py-12">
      <LoginForm />
    </div>
  );
}
