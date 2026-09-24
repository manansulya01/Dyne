import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { createBuilding, listBuildings } from "@/lib/db/campus";
import { toBuildingJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import { z } from "zod";

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);

  const buildings = await listBuildings(db, search, limit + 1, cursor);
  // Name-ordered cursor pagination (matches the previous contract).
  const page = buildings.map((b) => toBuildingJSON(b as unknown as Record<string, unknown>));
  const hasMore = page.length > limit;
  const slice = page.slice(0, limit);

  return NextResponse.json({
    buildings: slice,
    cursor: slice.length ? slice[slice.length - 1].name : null,
    hasMore,
  });
}

export async function POST(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!["admin", "staff", "teacher"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const parsed = z.object({ name: z.string().min(2).max(100), description: z.string().max(2000).optional() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const created = await createBuilding(db, parsed.data);
  if (!created.ok) return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  return NextResponse.json({ id: created.buildingId.toHexString() }, { status: 201 });
}
