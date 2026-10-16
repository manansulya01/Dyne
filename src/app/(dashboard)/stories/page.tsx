import type { Metadata } from "next";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { listActiveStories } from "@/lib/db/stories";
import { toStoryJSON } from "@/lib/db/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { StoriesClient } from "./StoriesClient";

export const metadata: Metadata = {
  title: "Stories — Dyne",
  description: "Ephemeral campus stories on Dyne.",
};

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);

  // Only approved, unexpired stories are ever returned here.
  const { groups } = await listActiveStories(db, { limit: 100 }).catch(() => ({ groups: [] }));

  return (
    <StoriesClient
      initialGroups={groups.map((g) => ({
        author: g.author as never,
        stories: g.stories.map((s) => toStoryJSON(s as unknown as Record<string, unknown>)),
      }))}
      canCreate={user ? hasPermission(user.role, "stories.create") : false}
      currentUserId={user?.id ?? null}
    />
  );
}
