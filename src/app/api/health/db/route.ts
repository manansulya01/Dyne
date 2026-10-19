import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Safe operational check: never returns a connection string or secret. */
export async function GET() {
  const configured = Boolean(process.env.MONGODB_URI?.trim());
  if (!configured) {
    return NextResponse.json({
      ok: false,
      database: "not_configured",
      message: "MONGODB_URI is missing from the deployment environment.",
    }, { status: 503 });
  }
  try {
    const db = await getDb();
    const result = await db.command({ ping: 1 });
    if (result.ok !== 1) throw new Error("MongoDB ping failed");
    return NextResponse.json({ ok: true, database: "connected" });
  } catch {
    return NextResponse.json({
      ok: false,
      database: "unreachable",
      message: "MongoDB is configured but cannot be reached. Check the URI, network access/IP allow-list, database user permissions, and deployment environment.",
    }, { status: 503 });
  }
}
