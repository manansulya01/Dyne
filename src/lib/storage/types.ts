/**
 * Provider-independent object storage abstraction.
 *
 * Buckets mirror the product's media domains. Drivers:
 *   - local: filesystem directory (development/tests, no credentials)
 *   - r2:    Cloudflare R2 via the S3 API (production; needs credentials)
 *
 * Large binaries are NEVER stored in MongoDB — only metadata records
 * referencing driver URLs/keys.
 */

export const storageBuckets = [
  "avatars",
  "post-media",
  "community-images",
  "event-images",
  "message-attachments",
  "video-thumbnails",
  "watch-videos",
] as const;

export type StorageBucket = (typeof storageBuckets)[number];

/** Buckets readable without authentication. */
export const publicBuckets: ReadonlySet<string> = new Set([
  "avatars",
  "post-media",
  "community-images",
  "event-images",
  "video-thumbnails",
]);

/** Buckets requiring an authenticated request to read. */
export const privateBuckets: ReadonlySet<string> = new Set([
  "message-attachments",
  "watch-videos",
]);

export function isStorageBucket(value: unknown): value is StorageBucket {
  return (
    typeof value === "string" &&
    (storageBuckets as readonly string[]).includes(value)
  );
}

export interface StoredUpload {
  /** Opaque driver key, e.g. "userId/uuid.png" (never a raw client path). */
  key: string;
  /** Retrieval URL (public URL or same-origin /api/files/... route). */
  url: string;
  mime: string;
  size: number;
}

export interface StorageDriver {
  readonly name: string;
  put(bucket: StorageBucket, key: string, bytes: Uint8Array, mime: string): Promise<{ url: string }>;
  get(bucket: StorageBucket, key: string): Promise<{ bytes: Uint8Array; mime: string } | null>;
  delete(bucket: StorageBucket, key: string): Promise<void>;
  /** Public retrieval URL without any auth context (only for public buckets). */
  publicUrl(bucket: StorageBucket, key: string): string;
}

/** Per-bucket upload policy (mirrors the previous backend's limits). */
export const bucketPolicies: Record<
  StorageBucket,
  { maxBytes: number; mime: string[] }
> = {
  avatars: {
    maxBytes: 5 * 1024 * 1024,
    mime: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  },
  "post-media": {
    maxBytes: 50 * 1024 * 1024,
    mime: [
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "video/mp4", "video/webm", "video/quicktime",
    ],
  },
  "community-images": {
    maxBytes: 10 * 1024 * 1024,
    mime: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  },
  "event-images": {
    maxBytes: 10 * 1024 * 1024,
    mime: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  },
  "message-attachments": {
    maxBytes: 25 * 1024 * 1024,
    mime: [
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "video/mp4", "video/webm", "video/quicktime",
      "application/pdf", "text/plain",
    ],
  },
  "video-thumbnails": {
    maxBytes: 5 * 1024 * 1024,
    mime: ["image/jpeg", "image/png", "image/webp"],
  },
  "watch-videos": {
    maxBytes: 500 * 1024 * 1024,
    mime: ["video/mp4", "video/webm", "video/quicktime"],
  },
};

export interface ValidatedUpload {
  bucket: StorageBucket;
  extension: string;
  mime: string;
  size: number;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
  "text/plain": "txt",
};

/** Validate user-supplied file metadata before any bytes are stored. */
export function validateUpload(
  bucket: StorageBucket,
  mime: string,
  size: number,
  originalName: string
): ValidatedUpload {
  const policy = bucketPolicies[bucket];
  if (!policy.mime.includes(mime)) {
    throw new Error(`File type ${mime} is not allowed in ${bucket}`);
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("Empty file");
  }
  if (size > policy.maxBytes) {
    throw new Error(
      `File exceeds the ${Math.round(policy.maxBytes / 1024 / 1024)}MB limit for ${bucket}`
    );
  }
  const fromName = originalName.split(".").pop()?.toLowerCase() || "";
  const extension = EXT_BY_MIME[mime] ?? fromName.replace(/[^a-z0-9]/g, "") ?? "bin";
  if (!extension) throw new Error("Could not determine a safe file extension");
  return { bucket, extension, mime, size };
}

/** Build a safe storage key. Client paths are never used. */
export function buildKey(ownerId: string, id: string, extension: string): string {
  // Fail closed: reject dirty components instead of silently sanitizing them.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(ownerId)) throw new Error("Invalid storage key owner");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("Invalid storage key id");
  const safeExt = extension.replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  return `${ownerId}/${id}.${safeExt}`;
}
/** Reject keys containing traversal or absolute segments. */
export function assertSafeKey(key: string): void {
  if (
    !key ||
    key.includes("..") ||
    key.startsWith("/") ||
    key.includes("\\") ||
    !/^[A-Za-z0-9_\-/]+\.[a-z0-9]{1,8}$/.test(key)
  ) {
    throw new Error("Invalid storage key");
  }
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
};

/** Best-effort content type for serving stored objects. */
export function mimeForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}
