import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { setMemberRole } from "@/lib/db/communities";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const db = await getDb();
  await ensureIndexes(db);

  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const { id, memberId } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }
  if (!objectIdSchema.safeParse(memberId).success) {
    return NextResponse.json({ error: "Invalid member ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const { role } = body ?? {};

  if (!["member", "moderator"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const result = await setMemberRole(db, id, memberId, user.id, role, user.role === "admin");
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }
    if (result.reason === "not_member") {
      return NextResponse.json({ error: "User is not a member" }, { status: 404 });
    }
    const messages: Record<string, string> = {
      forbidden: "Forbidden",
      cannot_change_owner: "Cannot change owner's role",
      owner_only_promote: "Only owners can assign moderator role",
      owner_only_demote: "Only owners can demote moderators",
    };
    return NextResponse.json(
      { error: messages[result.reason] ?? "Forbidden" },
      { status: 403 }
    );
  }

  return NextResponse.json({ success: true });
}
