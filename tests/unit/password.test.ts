import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("hashes and verifies, rejects wrong passwords", async () => {
    const hash = await hashPassword("Correct-Horse-123!");
    expect(hash).not.toContain("Correct-Horse-123!");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("Correct-Horse-123!", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces unique salts per password", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("fails closed on empty/malformed input", async () => {
    const hash = await hashPassword("valid-password-1");
    expect(await verifyPassword("", hash)).toBe(false);
    expect(await verifyPassword("valid-password-1", "")).toBe(false);
    expect(await verifyPassword("valid-password-1", "not-a-hash")).toBe(false);
  });
});
