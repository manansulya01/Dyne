import { Db, ObjectId } from "mongodb";
import { col, type UserDoc } from "@/lib/mongo/collections";

/** Minimal author shape embedded in feed payloads (never secrets). */
export interface AuthorShape {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** Batch-resolve author ids to public shapes in a single query. */
export async function resolveAuthors(db: Db, ids: ObjectId[]): Promise<Map<string, AuthorShape>> {
  const unique = [...new Map(ids.map((id) => [id.toHexString(), id])).values()];
  if (unique.length === 0) return new Map();
  const rows = await col<UserDoc>(db, "users")
    .find({ _id: { $in: unique } } as never)
    .project({ username: 1, displayName: 1, avatarUrl: 1 })
    .toArray();
  return new Map(
    rows.map((u) => [
      u._id.toHexString(),
      {
        id: u._id.toHexString(),
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
      },
    ])
  );
}
