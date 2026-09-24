import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type CommunityDoc } from "@/lib/mongo/collections";
import { objectIdSchema, toObjectId } from "@/lib/mongo/ids";
import { postCreateSchema } from "@/lib/validation";
import { createCommunityPost, listCommunityPosts, memberRole } from "@/lib/db/communities";
import { toCommunityPostJSON } from "@/lib/db/contracts";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

export async function POST(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const formData = await request.formData();
  const content = formData.get("content") as string;
  const communityId = formData.get("communityId") as string;

  if (!communityId || !objectIdSchema.safeParse(communityId).success) {
    return NextResponse.json({ error: "Community ID required" }, { status: 400 });
  }

  const validated = postCreateSchema.safeParse({ content });
  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const membership = await memberRole(db, communityId, user.id);
  if (!membership) {
    const community = await col<CommunityDoc>(db, "communities").findOne({
      _id: toObjectId(communityId),
    } as never);
    if (!community) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }
    if (community.isPrivate) {
      return NextResponse.json({ error: "This community is private" }, { status: 403 });
    }
  }

  const created = await createCommunityPost(
    db,
    communityId,
    user.id,
    validated.data.content ?? ""
  );
  if (!created.ok) {
    if (created.reason === "forbidden") {
      return NextResponse.json({ error: "This community is private" }, { status: 403 });
    }
    return NextResponse.json(
      { error: { content: ["Post must include text"] } },
      { status: 400 }
    );
  }

  const rows = await listCommunityPosts(db, communityId, 50);
  const full = rows.find(
    (p) => String((p as unknown as Record<string, unknown>).id) === created.postId.toHexString()
  );
  return NextResponse.json({
    post: full
      ? toCommunityPostJSON(full as unknown as Record<string, unknown>)
      : { id: created.postId.toHexString() },
  });
}
