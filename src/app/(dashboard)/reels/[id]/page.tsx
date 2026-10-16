import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { getReel } from "@/lib/db/reels";
import { toReelJSON } from "@/lib/db/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { ReelDetailClient } from "./ReelDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return { title: "Reel — Dyne" };
  }
  const db = await getDb();
  const reel = await getReel(db, id).catch(() => null);
  if (!reel) return { title: "Reel — Dyne" };
  const raw = reel as unknown as Record<string, unknown>;
  const title = String(raw.title ?? "Reel");
  const caption = String(raw.caption ?? "");
  return {
    title: `${title} — Dyne Reels`,
    description: caption.slice(0, 160) || "Watch this campus reel on Dyne.",
    openGraph: {
      title,
      description: caption.slice(0, 160) || undefined,
      type: "video.other",
      videos: [{ url: String(raw.videoUrl ?? "") }],
    },
  };
}

export const dynamic = "force-dynamic";

export default async function ReelDetailPage({ params }: Props) {
  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) notFound();

  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);

  const reel = await getReel(db, id, user?.id);
  if (!reel) notFound();
  const raw = reel as unknown as Record<string, unknown>;

  const status = String(raw.moderationStatus ?? "pending");
  const isOwner = user && String(raw.creatorId) === user.id;
  const isModerator = user ? hasPermission(user.role, "reels.moderate") : false;
  // 404 (not 403) for content the viewer may not see: no existence oracle.
  if (status !== "approved" && !isOwner && !isModerator) notFound();

  return (
    <ReelDetailClient
      reel={toReelJSON(raw)}
      currentUserId={user?.id ?? null}
      isOwner={Boolean(isOwner)}
      canModerate={isModerator}
    />
  );
}
