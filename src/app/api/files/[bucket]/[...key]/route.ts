import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { col } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/session";
import { isConversationMember } from "@/lib/db/chat";
import {
  assertSafeKey,
  isStorageBucket,
  mimeForKey,
  privateBuckets,
} from "@/lib/storage/types";
import { getStorageDriver as resolveDriver } from "@/lib/storage/index";

interface Params {
  params: Promise<{ bucket: string; key: string[] }>;
}

/**
 * Serve stored objects. Public buckets stream to anyone; private buckets
 * require an authenticated session. Message attachments additionally require
 * conversation membership (per-object authorization, not just login).
 * Study materials and watch videos additionally require a live referencing
 * document — removed/rejected/deleted content must not stay reachable via a
 * direct file URL after moderation. Missing-or-forbidden both read as 404
 * (no existence oracle). Keys are validated against traversal. Auth runs
 * before any byte reads.
 */
export async function GET(_request: Request, { params }: Params) {
  const { bucket: rawBucket, key: keyParts } = await params;

  if (!isStorageBucket(rawBucket)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const key = (keyParts ?? []).join("/");
  try {
    assertSafeKey(key);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (privateBuckets.has(rawBucket)) {
    const db = await getDb();
    const user = await getSessionUser(db);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (rawBucket === "message-attachments") {
      // Only members of the conversation holding this attachment may read it.
      // Missing-or-forbidden both read as 404 (no existence oracle).
      const url = `/api/files/${rawBucket}/${key}`;
      const message = await col(db, "chatMessages").findOne({
        attachments: { $elemMatch: { url } },
        deletedAt: null,
      } as never);
      if (!message) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const member = await isConversationMember(db, message.conversationId, user.id);
      if (!member) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }
    if (rawBucket === "study-materials") {
      // Removed or rejected materials stay hidden even via direct file URLs.
      const material = await col(db, "studyMaterials").findOne({ key } as never);
      if (!material || material.isRemoved || material.status === "rejected") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }
    if (rawBucket === "watch-videos") {
      // Deleted videos stay hidden even via direct file URLs.
      const url = `/api/files/${rawBucket}/${key}`;
      const video = await col(db, "videos").findOne({ videoUrl: url } as never);
      if (!video) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }
    if (rawBucket === "reel-videos") {
      // Deleted or moderated-away reels stay hidden via direct file URLs.
      const url = `/api/files/${rawBucket}/${key}`;
      const reel = await col(db, "reels").findOne({ videoUrl: url } as never);
      if (!reel) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      // Owners can still preview their own held reel; nobody else can.
      if (reel.moderationStatus !== "approved" && reel.creatorId.toHexString() !== user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }
    if (rawBucket === "story-media") {
      const url = `/api/files/${rawBucket}/${key}`;
      const story = await col(db, "stories").findOne({ mediaUrl: url } as never);
      if (!story || story.expiresAt.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (story.moderationStatus !== "approved") {
        const isOwner = story.authorId.toHexString() === user.id;
        if (!isOwner) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
      }
    }
  }

  let file;
  try {
    file = await resolveDriver().get(rawBucket, key);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(file.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": mimeForKey(key),
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(file.bytes.length),
      // User-uploaded bytes: never let browsers sniff them as HTML/JS.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
