import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { col } from "@/lib/mongo/collections";
import { getSessionUser } from "@/lib/auth/session";
import { isConversationMember } from "@/lib/db/chat";
import {
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
 * Keys are validated against traversal. Auth runs before any byte reads.
 */
export async function GET(_request: Request, { params }: Params) {
  const { bucket: rawBucket, key: keyParts } = await params;

  if (!isStorageBucket(rawBucket)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const key = (keyParts ?? []).join("/");

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
