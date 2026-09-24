import type { Metadata } from "next";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/session";
import { findUserById } from "@/lib/db/users";
import { toProfileJSON } from "@/lib/db/contracts";
import { SettingsPageClient } from "./SettingsPageClient";

export const metadata: Metadata = {
  title: "Settings — Dyne",
  description: "Manage your Dyne profile, account, and preferences.",
};

export default async function SettingsPage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);

  const full = user ? await findUserById(db, user.id) : null;
  const profile = full ? toProfileJSON(full as unknown as Record<string, unknown>) : null;

  return (
    <SettingsPageClient
      profile={profile}
      email={user?.email ?? ""}
    />
  );
}
