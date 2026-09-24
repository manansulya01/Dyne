import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageBucket, StorageDriver } from "./types";
import { assertSafeKey, publicBuckets } from "./types";

/**
 * Cloudflare R2 driver (S3-compatible API).
 *
 * Required environment (production only; never commit):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_PUBLIC_BASE_URL (public base for public buckets, e.g. https://pub-xxx.r2.dev
 *   or a custom domain), optional R2_BUCKET_PREFIX.
 *
 * NOTE: live R2 verification requires credentials the test environment does
 * not have; this driver is type-checked, interface-conformant, and exercised
 * through the shared driver contract tests using the local driver. The R2
 * code path itself is reached only when STORAGE_DRIVER=r2 with credentials.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} for the R2 storage driver`);
  return value;
}

export class R2StorageDriver implements StorageDriver {
  readonly name = "r2";
  private readonly client: S3Client;
  private readonly prefix: string;
  private readonly publicBase: string;

  constructor() {
    const accountId = required("R2_ACCOUNT_ID");
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      },
    });
    this.prefix = process.env.R2_BUCKET_PREFIX ?? "";
    this.publicBase = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  }

  private bucketName(bucket: StorageBucket): string {
    return `${this.prefix}${bucket}`;
  }

  async put(bucket: StorageBucket, key: string, bytes: Uint8Array, mime: string) {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        Body: bytes,
        ContentType: mime,
      })
    );
    return { url: this.publicUrl(bucket, key) };
  }

  async get(bucket: StorageBucket, key: string) {
    assertSafeKey(key);
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key })
      );
      const bytes = out.Body ? new Uint8Array(await out.Body.transformToByteArray()) : new Uint8Array();
      return { bytes, mime: out.ContentType ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }

  async delete(bucket: StorageBucket, key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucketName(bucket), Key: key })
    );
  }

  publicUrl(bucket: StorageBucket, key: string): string {
    assertSafeKey(key);
    if (!publicBuckets.has(bucket)) {
      // Private buckets must go through the app's signed-URL endpoint.
      return `/api/files/${bucket}/${key}`;
    }
    if (!this.publicBase) {
      throw new Error("R2_PUBLIC_BASE_URL is required to serve public R2 objects");
    }
    return `${this.publicBase}/${this.bucketName(bucket)}/${key}`;
  }

  /** Short-lived signed URL for private objects (served via /api/files route). */
  async signedUrl(bucket: StorageBucket, key: string, expiresInSeconds = 3600): Promise<string> {
    assertSafeKey(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key }),
      { expiresIn: expiresInSeconds }
    );
  }
}
