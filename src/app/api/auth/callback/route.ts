import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/feed";
  // Prevent open redirects: only allow same-origin relative paths.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/feed";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      redirect(next);
    }
  }

  redirect("/login?error=Could not authenticate user");
}