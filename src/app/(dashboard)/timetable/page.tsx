import type { Metadata } from "next";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/session";
import { TimetableClient } from "./TimetableClient";

export const metadata: Metadata = { title: "Timetable — Dyne", description: "Weekly timetable with days, periods, subjects, rooms, and teachers." };

export default async function TimetablePage() {
  const db = await getDb();
  await ensureIndexes(db);
  const user = await getSessionUser(db);
  const canEdit = !!user && ["admin", "teacher", "staff"].includes(user.role);
  return <TimetableClient canEdit={canEdit} />;
}
