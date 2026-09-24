import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { StorageBucket, StorageDriver } from "./types";
import { assertSafeKey } from "./types";

/**
 * Filesystem storage driver for development and tests.
 *
 * Layout: <root>/<bucket>/<key>. No credentials required. The serving route
 * (/api/files) enforces bucket visibility + ownership; the driver itself is
 * intentionally dumb.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = "local";
  private readonly root: string;

  constructor(root?: string) {
    this.root =
      root ??
      process.env.STORAGE_LOCAL_DIR ??
      path.join(process.cwd(), "storage-local");
  }

  private filePath(bucket: StorageBucket, key: string): string {
    assertSafeKey(key);
    const full = path.normalize(path.join(this.root, bucket, key));
    if (!full.startsWith(path.normalize(this.root + path.sep))) {
      throw new Error("Storage key escapes the storage root");
    }
    return full;
  }

  async put(bucket: StorageBucket, key: string, bytes: Uint8Array, _mime: string) {
    const file = this.filePath(bucket, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    return { url: this.publicUrl(bucket, key) };
  }

  async get(bucket: StorageBucket, key: string) {
    try {
      const file = this.filePath(bucket, key);
      const data = await readFile(file);
      return { bytes: new Uint8Array(data), mime: "application/octet-stream" };
    } catch {
      return null;
    }
  }

  async delete(bucket: StorageBucket, key: string): Promise<void> {
    try {
      await rm(this.filePath(bucket, key), { force: true });
    } catch {
      // Best effort; missing files are already gone.
    }
  }

  /** Local files are served through the app's /api/files route (auth-aware). */
  publicUrl(bucket: StorageBucket, key: string): string {
    assertSafeKey(key);
    return `/api/files/${bucket}/${key}`;
  }

  /** Content fingerprint helper (dedupe/verification without reading twice). */
  static fingerprint(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
  }
}
