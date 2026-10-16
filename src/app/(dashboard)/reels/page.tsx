import type { Metadata } from "next";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { listReels } from "@/lib/db/reels";
import { toReelJSON } from "@/lib/db/contracts";
import { listReelCategories } from "@/lib/db/reels";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { ReelsFeed } from "./ReelsFeed";

export const metadata: Metadata = {
  title: "Reels — Dyne",
  description: "Short vertical campus videos from Macro Vision Academy.",
};

export const dynamic = "force-dynamic";

export default async function ReelsPage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);

  // Server-render the first page so the feed is meaningful without JS and the
  // client only paginates from there.
  const reels = await listReels(db, { limit: 8 }).catch(() => []);
  const categories = await listReelCategories(db).catch(() => []);

  const last = reels[reels.length - 1] as unknown as
    | { id?: string; createdAt?: Date }
    | undefined;

  return (
    <ReelsFeed
      initialReels={reels.map((r) => toReelJSON(r as unknown as Record<string, unknown>))}
      initialCursor={
        last && last.createdAt
          ? { before: String(last.createdAt), beforeId: String(last.id ?? "") }
          : null
      }
      initialHasMore={reels.length === 8}
      categories={categories}
      currentUserId={user?.id ?? null}
      canUpload={user ? hasPermission(user.role, "reels.create") : false}
    />
  );
}
