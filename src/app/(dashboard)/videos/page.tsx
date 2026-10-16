import type { Metadata } from "next";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { listVideos, listVideoCategories } from "@/lib/db/videos";
import { toVideoJSON } from "@/lib/db/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { VideosBrowse } from "./VideosBrowse";

/**
 * Dyne Videos — horizontal / long-form library.
 *
 * Distinct from Reels: landscape 16:9, longer, lecture/event/documentary
 * oriented. Shares storage + moderation infrastructure with reels but has its
 * own route, upload flow and browsing experience.
 */
export const metadata: Metadata = {
  title: "Videos — Dyne",
  description: "Campus videos on Dyne: lectures, events, performances and documentaries.",
};

export const dynamic = "force-dynamic";

export default async function VideosPage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);

  const videos = await listVideos(db, { limit: 24 }).catch(() => []);
  const categories = await listVideoCategories(db).catch(() => []);

  return (
    <VideosBrowse
      initialVideos={videos.map((v) => toVideoJSON(v as unknown as Record<string, unknown>))}
      initialCursor={
        videos.length > 0
          ? {
              before: String(
                (videos[videos.length - 1] as unknown as { createdAt?: Date }).createdAt ?? ""
              ),
              beforeId: String((videos[videos.length - 1] as unknown as { id?: string }).id ?? ""),
            }
          : null
      }
      initialHasMore={videos.length === 24}
      categories={categories}
      currentUserId={user?.id ?? null}
      canUpload={user ? hasPermission(user.role, "videos.create") : false}
    />
  );
}
