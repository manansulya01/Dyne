import type { Metadata } from "next";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { listAnnouncements } from "@/lib/db/announcements";
import { assignableClassGrades } from "@/lib/db/teacherAssignments";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, isAdminRole } from "@/lib/permissions";
import { AnnouncementsClient } from "./AnnouncementsClient";

export const metadata: Metadata = {
  title: "Announcements — Dyne",
  description: "Campus announcements on Dyne.",
};

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);

  const items = await listAnnouncements(db, {
    limit: 50,
    viewerRole: user?.role,
    viewerId: user?.id,
  }).catch(() => []);

  const canManage = user ? hasPermission(user.role, "announcements.create") : false;
  const classes = canManage ? await assignableClassGrades(db, user!) : [];

  return (
    <AnnouncementsClient
      initialAnnouncements={items.map((a) => {
        const raw = a as unknown as Record<string, unknown>;
        const author = raw.author as { username: string; display_name: string | null } | null;
        return {
          id: String(raw.id ?? ""),
          title: String(raw.title ?? ""),
          body: String(raw.body ?? ""),
          category: (raw.category ?? null) as string | null,
          priority: String(raw.priority ?? "normal"),
          audience: String(raw.audience ?? "all"),
          is_pinned: Boolean(raw.isPinned ?? raw.is_pinned),
          link_url: (raw.linkUrl ?? raw.link_url ?? null) as string | null,
          attachment_url: (raw.attachmentUrl ?? raw.attachment_url ?? null) as string | null,
          starts_at: (raw.startsAt ?? raw.starts_at ?? null) as string | null,
          ends_at: (raw.endsAt ?? raw.ends_at ?? null) as string | null,
          created_at: String(raw.createdAt ?? ""),
          author,
        };
      })}
      canManage={canManage}
      isAdmin={user ? isAdminRole(user.role) : false}
      classes={classes}
    />
  );
}
