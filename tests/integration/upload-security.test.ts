import { describe, expect, it } from "vitest";
import {
  validateUpload,
  assertSafeKey,
  buildKey,
  isStorageBucket,
  sniffMismatch,
} from "@/lib/storage/types";

describe("upload security", () => {
  it("rejects executable uploads regardless of claimed MIME", () => {
    expect(() => validateUpload("post-media", "image/png", 100, "evil.exe")).toThrow();
    expect(() => validateUpload("study-materials", "application/pdf", 100, "run.sh")).toThrow();
    expect(() => validateUpload("avatars", "image/jpeg", 100, "x.js")).toThrow();
    expect(() => validateUpload("avatars", "image/jpeg", 100, "x.html")).toThrow();
  });

  it("rejects MIME spoofing (extension must match MIME)", () => {
    expect(() => validateUpload("avatars", "image/png", 100, "photo.jpg")).toThrow(/does not match/);
    expect(() => validateUpload("study-materials", "application/pdf", 100, "doc.png")).toThrow();
    // Matching pairs pass.
    expect(validateUpload("study-materials", "application/pdf", 100, "notes.pdf").extension).toBe("pdf");
    expect(validateUpload("avatars", "image/jpeg", 100, "a.jpeg").extension).toBe("jpg");
  });

  it("rejects oversized files per bucket", () => {
    expect(() => validateUpload("avatars", "image/png", 6 * 1024 * 1024, "a.png")).toThrow(/exceeds/);
    expect(() => validateUpload("study-materials", "application/pdf", 51 * 1024 * 1024, "a.pdf")).toThrow(/exceeds/);
    expect(() => validateUpload("post-media", "image/png", 0, "a.png")).toThrow(/Empty/);
  });

  it("rejects path traversal and arbitrary paths", () => {
    expect(() => buildKey("../../etc", "x", "png")).toThrow();
    expect(() => assertSafeKey("../x.png")).toThrow();
    expect(() => assertSafeKey("/abs.png")).toThrow();
    expect(() => assertSafeKey("a\\b.png")).toThrow();
    expect(() => assertSafeKey("no-extension")).toThrow();
    expect(isStorageBucket("study-materials")).toBe(true);
    expect(isStorageBucket("../../../etc")).toBe(false);
  });

  it("rejects disallowed MIME in study-materials", () => {
    expect(() => validateUpload("study-materials", "video/mp4", 100, "a.mp4")).toThrow(/not allowed/);
    expect(() => validateUpload("study-materials", "application/x-msdownload", 100, "a.exe")).toThrow();
  });

  it("sniffs real file signatures instead of trusting the browser MIME", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    // A shell script renamed to .png and declared image/png is refused.
    expect(sniffMismatch("image/png", enc("#!/bin/sh\necho pwned"))).toMatch(/do not look like/);
    expect(sniffMismatch("image/png", enc("<html><script>alert(1)</script>"))).toMatch(/do not look like/);
    expect(sniffMismatch("application/pdf", enc("MZ\u0090\u0000"))).toMatch(/do not look like/);
    // Genuine signatures pass.
    expect(sniffMismatch("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBeNull();
    expect(sniffMismatch("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBeNull();
    expect(sniffMismatch("application/pdf", enc("%PDF-1.7\n%..."))).toBeNull();
    // webp carries its marker at byte 8.
    expect(sniffMismatch("image/webp", new Uint8Array([...enc("RIFF"), 0, 0, 0, 0, ...enc("WEBP")]))).toBeNull();
    // Formats without a reliable signature (plain text, Office) pass through.
    expect(sniffMismatch("text/plain", enc("just some notes"))).toBeNull();
    expect(
      sniffMismatch("application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Uint8Array([0x50, 0x4b, 3, 4]))
    ).toBeNull();
    // Empty or truncated payloads never match.
    expect(sniffMismatch("image/png", new Uint8Array([0x89]))).toMatch(/do not look like/);
  });
});
