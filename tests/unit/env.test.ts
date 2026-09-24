import { describe, expect, it, afterEach, vi } from "vitest";
import { getMongoEnv, getAuthSecret, getSiteUrl } from "@/lib/mongo/env";

describe("mongo env validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a missing MONGODB_URI without leaking values", () => {
    vi.stubEnv("MONGODB_URI", "");
    expect(() => getMongoEnv()).toThrowError(/MONGODB_URI/);
  });

  it("rejects non-mongodb schemes", () => {
    vi.stubEnv("MONGODB_URI", "https://example.com/db");
    expect(() => getMongoEnv()).toThrowError(/mongodb/);
  });

  it("accepts mongodb and mongodb+srv schemes and defaults db name", () => {
    vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");
    vi.stubEnv("MONGODB_DB", "");
    expect(getMongoEnv()).toEqual({ uri: "mongodb://localhost:27017", dbName: "dyne" });
    vi.stubEnv("MONGODB_URI", "mongodb+srv://cluster.example.net");
    vi.stubEnv("MONGODB_DB", "custom");
    expect(getMongoEnv().dbName).toBe("custom");
  });

  it("requires AUTH_SECRET in production and enforces length", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => getAuthSecret()).toThrowError(/AUTH_SECRET/);
    vi.stubEnv("AUTH_SECRET", "short");
    expect(() => getAuthSecret()).toThrowError(/32 characters/);
    vi.stubEnv("AUTH_SECRET", "x".repeat(32));
    expect(getAuthSecret()).toHaveLength(32);
  });

  it("allows a dev fallback outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AUTH_SECRET", "");
    expect(typeof getAuthSecret()).toBe("string");
  });

  it("resolves site URL with env > origin > localhost default", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(getSiteUrl("https://x.example")).toBe("https://x.example");
    expect(getSiteUrl()).toBe("http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://dyne.example");
    expect(getSiteUrl("https://x.example")).toBe("https://dyne.example");
  });
});
