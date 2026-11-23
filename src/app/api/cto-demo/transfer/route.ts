import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 8;

function checkLimit(request: Request) {
  const key = clientKey(request, "cto-demo-guest");
  const result = rateLimit("cto-demo-transfer:" + key, REQUESTS_PER_WINDOW, WINDOW_MS);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Demo benchmark limit reached. Wait one minute and try again." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }
  return null;
}

/**
 * Public, non-persistent CTO preview benchmark.
 * POST measures a real browser-to-Vercel request carrying file bytes.
 * GET measures a real Vercel-to-browser response carrying generated test bytes.
 * No file bytes are stored, indexed, logged, or forwarded to the school database.
 */
export async function POST(request: Request) {
  const limited = checkLimit(request);
  if (limited) return limited;

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength <= 0 || declaredLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "Send a file between 1 byte and 5 MB for the live network benchmark." },
      { status: 413, headers: { "Cache-Control": "no-store" } }
    );
  }

  const started = performance.now();
  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Could not read benchmark upload." }, { status: 400 });
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Benchmark payload must be 1 byte to 5 MB." }, { status: 413 });
  }

  return NextResponse.json(
    {
      success: true,
      receivedBytes: bytes.byteLength,
      serverReceiveMs: Number((performance.now() - started).toFixed(3)),
      stored: false,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: Request) {
  const limited = checkLimit(request);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("bytes") ?? 1024 * 1024);
  if (!Number.isInteger(requested) || requested < 1 || requested > MAX_BYTES) {
    return NextResponse.json(
      { error: "Request a test payload between 1 byte and 5 MB." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Deterministic, non-sensitive test payload; generated per request, never persisted.
  const bytes = new Uint8Array(requested);
  for (let offset = 0; offset < requested; offset += 65_536) {
    const end = Math.min(offset + 65_536, requested);
    for (let index = offset; index < end; index += 1) bytes[index] = index % 251;
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store, max-age=0",
      "X-Dyne-Benchmark-Bytes": String(bytes.byteLength),
      "X-Dyne-Benchmark-Storage": "ephemeral",
    },
  });
}
