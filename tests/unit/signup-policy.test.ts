import { describe, expect, it } from "vitest";
import { isPublicSignupAllowed } from "@/lib/auth/signup-policy";

describe("isPublicSignupAllowed", () => {
  it("keeps local development and test signups available", () => {
    expect(isPublicSignupAllowed("development", undefined)).toBe(true);
    expect(isPublicSignupAllowed("test", "false")).toBe(true);
  });

  it("fails closed in production unless explicitly enabled", () => {
    expect(isPublicSignupAllowed("production", undefined)).toBe(false);
    expect(isPublicSignupAllowed("production", "false")).toBe(false);
    expect(isPublicSignupAllowed("production", "true")).toBe(true);
  });
});
