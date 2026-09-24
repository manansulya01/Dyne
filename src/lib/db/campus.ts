import { Db } from "mongodb";
import { col, type BuildingDoc, type ClubDoc } from "@/lib/mongo/collections";
import { serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";

export async function listBuildings(db: Db, search?: string, limit = 50, cursor?: string | null) {
  const filter: Record<string, unknown> = {};
  if (search?.trim()) {
    filter.$or = [
      { name: { $regex: escapeLike(search), $options: "i" } },
      { description: { $regex: escapeLike(search), $options: "i" } },
    ];
  }
  // Name-ordered cursor pagination, filtered in the database.
  if (cursor) filter.name = { $gt: cursor };
  const rows = await col<BuildingDoc>(db, "buildings")
    .find(filter as never)
    .sort({ name: 1 })
    .limit(safeLimit(limit, 100))
    .toArray();
  return serializeMany(rows);
}

export async function listClubs(
  db: Db,
  opts: { search?: string; category?: string; limit?: number; cursor?: string | null } = {}
) {
  const filter: Record<string, unknown> = {};
  if (opts.search?.trim()) {
    filter.$or = [
      { name: { $regex: escapeLike(opts.search), $options: "i" } },
      { description: { $regex: escapeLike(opts.search), $options: "i" } },
    ];
  }
  if (opts.category) filter.category = opts.category;
  if (opts.cursor) filter.name = { $gt: opts.cursor };
  const rows = await col<ClubDoc>(db, "clubs")
    .find(filter as never)
    .sort({ name: 1 })
    .limit(safeLimit(opts.limit ?? 50, 100))
    .toArray();
  const categories = await col<ClubDoc>(db, "clubs").distinct("category", {});
  return {
    clubs: serializeMany(rows),
    categories: (categories as Array<string | null>).filter(Boolean),
  };
}

export async function createBuilding(db: Db, input: { name: string; description?: string | null; imageUrl?: string | null }) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 100) return { ok: false as const, reason: "bad_name" as const };
  const now = new Date();
  const res = await col<BuildingDoc>(db, "buildings").insertOne({
    name,
    description: input.description?.trim() || null,
    imageUrl: input.imageUrl || null,
    latitude: null,
    longitude: null,
    floorCount: null,
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, buildingId: res.insertedId };
}

export async function createClub(db: Db, input: { name: string; description?: string | null; imageUrl?: string | null; category?: string | null }) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 100) return { ok: false as const, reason: "bad_name" as const };
  const now = new Date();
  const res = await col<ClubDoc>(db, "clubs").insertOne({
    name,
    description: input.description?.trim() || null,
    imageUrl: input.imageUrl || null,
    category: input.category?.trim() || null,
    isOfficial: false,
    createdAt: now,
    updatedAt: now,
  } as never);
  return { ok: true as const, clubId: res.insertedId };
}

function escapeLike(s: string): string {
  // Slice BEFORE escaping: escaping first can leave a trailing lone `\`
  // (from a cut-off escape sequence), producing an invalid regex → 500.
  return s.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
