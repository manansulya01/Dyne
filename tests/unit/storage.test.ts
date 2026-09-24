import { describe, expect, it } from "vitest";
import {
  assertSafeKey,
  buildKey,
  isStorageBucket,
  privateBuckets,
  publicBuckets,
  storageBuckets,
  validateUpload,
} from "@/lib/storage/types";

describe("storage policy helpers", () => {
  it("recognizes the seven product buckets", () => {
    expect(storageBuckets).toHaveLength(7);
    for (const b of ["avatars", "post-media", "watch-videos"] as const) {
      expect(isStorageBucket(b)).toBe(true);
    }
    expect(isStorageBucket("nope")).toBe(false);
    expect(isStorageBucket("../avatars")).toBe(false);
  });

  it("splits public and private buckets", () => {
    expect(publicBuckets.has("avatars")).toBe(true);
    expect(privateBuckets.has("watch-videos")).toBe(true);
    expect(privateBuckets.has("message-attachments")).toBe(true);
    expect(publicBuckets.has("watch-videos")).toBe(false);
  });

  it("validates mime, size, and extension safely", () => {
    const ok = validateUpload("post-media", "image/png", 1024, "photo.PNG");
    expect(ok.extension).toBe("png");
    expect(() => validateUpload("avatars", "video/mp4", 100, "a.mp4")).toThrowError(/not allowed/);
    expect(() => validateUpload("avatars", "image/png", 6 * 1024 * 1024, "a.png")).toThrowError(/exceeds/);
    expect(() => validateUpload("avatars", "image/png", 0, "a.png")).toThrowError(/Empty/);
  });

  it("builds traversal-proof keys and rejects bad ones", () => {
    expect(buildKey("user123", "abc-XYZ_9", "png")).toBe("user123/abc-XYZ_9.png");
    // Fail closed: dirty components are rejected, never sanitized.
    expect(() => buildKey("../../etc", "x", "png")).toThrowError();
    expect(() => buildKey("", "x", "png")).toThrowError();
    assertSafeKey("user123/abc.png");
    expect(() => assertSafeKey("../x.png")).toThrowError();
    expect(() => assertSafeKey("/abs.png")).toThrowError();
    expect(() => assertSafeKey("a\\b.png")).toThrowError();
    expect(() => assertSafeKey("no-extension")).toThrowError();
  });
});
