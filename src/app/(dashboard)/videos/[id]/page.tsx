import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { getVideo, listVideos } from "@/lib/db/videos";
import { toVideoJSON } from "@/lib/db/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { VideosDetailClient } from "./VideosDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return { title: "Video — Dyne Videos" };
  }
  const db = await getDb();
  const video = await getVideo(db, id).catch(() => null);
  if (!video) return { title: "Video — Dyne Videos" };
  const raw = video as unknown as Record<string, unknown>;
  const title = String(raw.title ?? "Video");
  const description = String(raw.description ?? "");
  return {
    title: `${title} — Dyne Videos`,
    description: description.slice(0, 160) || "Watch campus videos on Dyne.",
  };
}

export default async function VideoDetailPage({ params }: Props) {
  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) notFound();

  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);

  const video = await getVideo(db, id, user?.id);
  if (!video) notFound();
  const raw = video as unknown as Record<string, unknown>;

  const status = String(raw.moderationStatus ?? "approved");
  const isOwner = user && String(raw.creatorId) === user.id;
  const isModerator = user ? hasPermission(user.role, "videos.moderate") : false;
  if (status !== "approved" && !isOwner && !isModerator) notFound();

  const more = await listVideos(db, { limit: 8 }).catch(() => []);
  const detail = toVideoJSON(raw);

  return (
    <VideosDetailClient
      video={{
        ...detail,
        video_url: detail.video_url,
        description: detail.description,
        moderation_status: detail.moderation_status,
        moderation_reason: detail.moderation_reason,
        liked_by_viewer: detail.liked_by_viewer,
      }}
      more={more
        .map((m) => toVideoJSON(m as unknown as Record<string, unknown>))
        .filter((m) => m.id !== detail.id)
        .slice(0, 8)}
      currentUserId={user?.id ?? null}
      isOwner={Boolean(isOwner)}
      canModerate={isModerator}
    />
  );
}
