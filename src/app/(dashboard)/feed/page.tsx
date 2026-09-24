import { Metadata } from "next";
import { FeedClient } from "./Feed";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/session";
import { findUserById } from "@/lib/db/users";
import { listPosts } from "@/lib/db/posts";
import { toPostJSON, toProfileJSON } from "@/lib/db/contracts";
import type { PostWithRelations } from "@/types";

export const metadata: Metadata = {
  title: "Home - Dyne",
  description: "Your campus feed",
};

export default async function HomePage() {
  const db = await getDb();
  await ensureIndexes(db);

  const user = await getSessionUser(db);
  if (!user) {
    return <FeedClient initialPosts={[]} profile={null} />;
  }

  const full = await findUserById(db, user.id);
  const profile = full ? toProfileJSON(full as unknown as Record<string, unknown>) : null;

  const posts = await listPosts(db, { limit: 20 });
  const transformedPosts = posts.map(
    (p) => toPostJSON(p as unknown as Record<string, unknown>) as unknown as PostWithRelations
  );

  return <FeedClient initialPosts={transformedPosts} profile={profile} />;
}
