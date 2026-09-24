import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { getSessionUser } from "@/lib/auth/session";
import { getVideo, listVideos } from "@/lib/db/videos";
import { toVideoJSON } from "@/lib/db/contracts";
import { WatchDetailClient } from "./WatchDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return { title: "Video — Dyne Watch", description: "Watch campus videos on Dyne." };
  }
  const db = await getDb();
  const video = await getVideo(db, id);
  const title = video ? String((video as unknown as Record<string, unknown>).title) : null;
  const description = video
    ? String((video as unknown as Record<string, unknown>).description ?? "")
    : "";
  return {
    title: title ? `${title} — Dyne Watch` : "Video — Dyne Watch",
    description: description.slice(0, 160) || "Watch campus videos on Dyne.",
  };
}

export default async function WatchDetailPage({ params }: Props) {
  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) notFound();

  const db = await getDb();
  await ensureIndexes(db);
  const sessionUser = await getSessionUser(db);

  const video = await getVideo(db, id);
  if (!video) notFound();

  const more = await listVideos(db, { limit: 6 });
  const moreFiltered: Array<{
    id: string;
    title: string;
    thumbnail_url: string | null;
    view_count: number;
    video_url: string;
  }> = more
    .filter((v) => String((v as unknown as Record<string, unknown>).id) !== id)
    .slice(0, 6)
    .map((v) => {
      const row = toVideoJSON(v as unknown as Record<string, unknown>);
      return {
        id: row.id,
        title: row.title,
        thumbnail_url: row.thumbnail_url,
        view_count: row.view_count,
        video_url: row.video_url,
      };
    });

  const detail = toVideoJSON(video as unknown as Record<string, unknown>);
  return (
    <WatchDetailClient
      video={detail as never}
      more={moreFiltered}
      currentUserId={sessionUser?.id ?? null}
    />
  );
}
