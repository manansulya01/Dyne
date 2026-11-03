import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

/** Create a request-scoped Supabase client using the SSR cookie adapter. */
export async function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: Parameters<typeof cookieStore.set>[2] }>) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot write cookies; Route Handlers and Actions can.
        }
      },
    },
  });
}
