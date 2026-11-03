import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Privileged server-only client. Never import into Client Components. */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Server administration requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
