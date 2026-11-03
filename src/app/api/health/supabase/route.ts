import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Safe Supabase readiness probe.
 *
 * It never returns credentials, database rows, or raw provider errors.
 * A successful response confirms that the public key can reach the expected
 * profile table. It does not imply that the application has been migrated
 * from MongoDB.
 */
export async function GET() {
  try {
    getSupabaseEnv();
  } catch {
    return NextResponse.json(
      { provider: "supabase", configured: false, ready: false },
      { status: 503 }
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .limit(1);

    if (error) {
      const schemaMissing =
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        /relation .*profiles.* does not exist|could not find the table/i.test(error.message);

      return NextResponse.json(
        {
          provider: "supabase",
          configured: true,
          ready: false,
          reason: schemaMissing ? "profiles_table_missing" : "database_check_failed",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      provider: "supabase",
      configured: true,
      ready: true,
      checked: "profiles",
      applicationBackend: "mongodb-transitional",
    });
  } catch {
    return NextResponse.json(
      { provider: "supabase", configured: true, ready: false, reason: "connection_failed" },
      { status: 503 }
    );
  }
}
