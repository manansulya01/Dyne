import { GridFSBucket, ObjectId } from "mongodb";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getDb } from "@/lib/mongo/client";
import type { StorageBucket, StorageDriver } from "./types";
import { assertSafeKey } from "./types";

/**
 * Persistent object storage backed by MongoDB GridFS.
 *
 * This keeps Dyne self-contained on its existing MongoDB Atlas deployment:
 * large media is stored in GridFS chunks, not embedded in application
 * documents. The existing /api/files route remains responsible for access
 * control before bytes are read.
 */
export class MongoGridFSStorageDriver implements StorageDriver {
  readonly name = "mongodb-gridfs";

  private bucket(db: Awaited<ReturnType<typeof getDb>>, name: StorageBucket) {
    const bucketName = `dyne_${name.replace(/-/g, "_")}`;
    return new GridFSBucket(db, { bucketName, chunkSizeBytes: 1024 * 1024 });
  }

  async put(bucket: StorageBucket, key: string, bytes: Uint8Array, mime: string) {
    assertSafeKey(key);
    const db = await getDb();
    const grid = this.bucket(db, bucket);
    const upload = grid.openUploadStream(key, {
      metadata: { contentType: mime, storageBucket: bucket },
    });
    await pipeline(Readable.from(Buffer.from(bytes)), upload);
    return { url: this.publicUrl(bucket, key) };
  }

  async get(bucket: StorageBucket, key: string) {
    assertSafeKey(key);
    const db = await getDb();
    const grid = this.bucket(db, bucket);
    const file = await db
      .collection(`dyne_${bucket.replace(/-/g, "_")}.files`)
      .find({ filename: key })
      .sort({ uploadDate: -1 })
      .limit(1)
      .next();

    if (!file) return null;

    const chunks: Buffer[] = [];
    const download = grid.openDownloadStream(file._id as ObjectId);
    for await (const chunk of download) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return {
      bytes: new Uint8Array(Buffer.concat(chunks)),
      mime:
        typeof file.metadata?.contentType === "string"
          ? file.metadata.contentType
          : "application/octet-stream",
    };
  }

  async delete(bucket: StorageBucket, key: string): Promise<void> {
    assertSafeKey(key);
    const db = await getDb();
    const grid = this.bucket(db, bucket);
    const files = db.collection(`dyne_${bucket.replace(/-/g, "_")}.files`);
    const matches = await files.find({ filename: key }, { projection: { _id: 1 } }).toArray();
    for (const file of matches) {
      await grid.delete(file._id as ObjectId);
    }
  }

  publicUrl(bucket: StorageBucket, key: string): string {
    assertSafeKey(key);
    return `/api/files/${bucket}/${key
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")}`;
  }
}
