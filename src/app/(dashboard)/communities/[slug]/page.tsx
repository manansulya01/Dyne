import { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommunityDetailClient } from "./CommunityDetailClient";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type CommunityDoc } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/session";
import { getCommunity, memberRole } from "@/lib/db/communities";
import { resolveAuthors } from "@/lib/db/authors";
import { toObjectId } from "@/lib/mongo/ids";
import { toCommunityJSON } from "@/lib/db/contracts";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} - Dyne`,
    description: `View community ${slug} on Dyne`,
  };
}

export default async function CommunityDetailPage({ params }: Props) {
  const { slug } = await params;
  const db = await getDb();
  await ensureIndexes(db);
  const sessionUser = await getSessionUser(db);

  const row = await col<CommunityDoc>(db, "communities").findOne({ slug } as never);
  if (!row) notFound();

  // Private communities are invisible to non-members (same as before).
  // Owners always pass; members pass via their membership row.
  const isOwner = !!sessionUser && row.ownerId.equals(toObjectId(sessionUser.id));
  if (row.isPrivate && !isOwner) {
    const role = sessionUser ? await memberRole(db, row._id, sessionUser.id) : null;
    if (!role) notFound();
  }

  const full = await getCommunity(db, row._id);
  if (!full) notFound();
  const raw = full as unknown as Record<string, unknown>;
  const role = sessionUser ? await memberRole(db, row._id, sessionUser.id) : null;
  const memberCount = await col(db, "communityMembers").countDocuments({
    communityId: row._id,
  } as never);
  const owners = await resolveAuthors(db, [row.ownerId]);

  const initialCommunity = toCommunityJSON({
    ...raw,
    memberCount,
    isMember: !!role,
    isOwner,
    memberRole: role ?? "none",
    owner: owners.get(row.ownerId.toHexString()) ?? null,
  });

  return (
    <CommunityDetailClient
      initialCommunity={initialCommunity as never}
      currentUserId={sessionUser?.id || null}
    />
  );
}
