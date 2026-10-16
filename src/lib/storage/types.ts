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
  "reel-videos",
  "story-media",
  "study-materials",
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
  "reel-videos",
  "story-media",
  "study-materials",
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
  // Reels are short: 90s ceiling enforced separately, size bounded here.
  "reel-videos": {
    maxBytes: 100 * 1024 * 1024,
    mime: ["video/mp4", "video/webm", "video/quicktime"],
  },
  "story-media": {
    maxBytes: 50 * 1024 * 1024,
    mime: [
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "video/mp4", "video/webm", "video/quicktime",
    ],
  },
  "study-materials": {
    maxBytes: 50 * 1024 * 1024,
    mime: [
      "application/pdf",
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
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
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

/** Executable / script extensions that are never allowed, even if MIME claims otherwise. */
const BLOCKED_EXTENSIONS = new Set([
  "exe", "msi", "bat", "cmd", "com", "scr", "pif", "ps1", "sh", "bash",
  "js", "mjs", "cjs", "html", "htm", "svg", "php", "py", "rb", "pl",
  "jar", "apk", "dmg", "iso", "dll", "so", "dylib",
]);

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
  if (BLOCKED_EXTENSIONS.has(fromName)) {
    throw new Error(`File extension .${fromName} is not allowed`);
  }
  // Extension must be consistent with the claimed MIME (MIME-spoof guard).
  const expected = EXT_BY_MIME[mime];
  if (expected && fromName && fromName !== expected) {
    // Allow jpg/jpeg alias; otherwise require the name to match the MIME.
    const aliases: Record<string, string[]> = { jpg: ["jpg", "jpeg"], mov: ["mov", "qt"] };
    const ok = aliases[expected]?.includes(fromName) ?? fromName === expected;
    if (!ok) {
      throw new Error(`File extension .${fromName} does not match type ${mime}`);
    }
  }
  const extension = EXT_BY_MIME[mime] ?? fromName.replace(/[^a-z0-9]/g, "") ?? "bin";
  if (!extension) throw new Error("Could not determine a safe file extension");
  if (BLOCKED_EXTENSIONS.has(extension)) throw new Error("File type is not allowed");
  return { bucket, extension, mime, size };
}

/**
 * Magic-byte signatures for the formats Dyne accepts. The browser-supplied
 * MIME type is attacker-controlled, so image/video/pdf bytes are sniffed
 * before storage. `null` means "no reliable signature" (plain text and the
 * Office formats, which are ZIP/compound containers) and is allowed through.
 */
const MAGIC_SIGNATURES: Array<{ mime: string; bytes: number[][]; offset?: number }> = [
  { mime: "image/jpeg", bytes: [[0xff, 0xd8, 0xff]] },
  { mime: "image/png", bytes: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  { mime: "image/gif", bytes: [[0x47, 0x49, 0x46, 0x38]] },
  // WebP is a RIFF container: "RIFF" at 0 and "WEBP" at 8.
  { mime: "image/webp", bytes: [[0x57, 0x45, 0x42, 0x50]], offset: 8 },
  { mime: "application/pdf", bytes: [[0x25, 0x50, 0x44, 0x46]] },
  { mime: "video/mp4", bytes: [[0x66, 0x74, 0x79, 0x70]], offset: 4 },
  { mime: "video/quicktime", bytes: [[0x66, 0x74, 0x79, 0x70]], offset: 4 },
  { mime: "video/webm", bytes: [[0x1a, 0x45, 0xdf, 0xa3]] },
];

function startsWith(bytes: Uint8Array, signature: number[], offset: number): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

/**
 * Content sniffing guard. Formats with a known signature must match the
 * claimed MIME; otherwise the upload is refused. Returns null when the bytes
 * are acceptable (matching signature, or a format we cannot verify).
 */
export function sniffMismatch(
  mime: string,
  bytes: Uint8Array
): string | null {
  const candidates = MAGIC_SIGNATURES.filter((s) => s.mime === mime);
  if (candidates.length === 0) return null; // unverifiable formats pass
  for (const sig of candidates) {
    for (const pattern of sig.bytes) {
      if (startsWith(bytes, pattern, sig.offset ?? 0)) return null;
    }
  }
  return `File contents do not look like ${mime}`;
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
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Best-effort content type for serving stored objects. */
export function mimeForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}
