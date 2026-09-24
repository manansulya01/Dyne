/**
 * Environment validation for the MongoDB-backed Dyne application.
 *
 * Required variables (see .env.example):
 *   MONGODB_URI  - MongoDB connection string (Atlas in production)
 *   MONGODB_DB   - database name (default: "dyne")
 *   AUTH_SECRET  - secret for session token signing/derivation (min 32 chars in production)
 *
 * Secrets are never logged. Validation errors describe WHAT is missing,
 * never the values themselves.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example for documentation.`
    );
  }
  return value;
}

export interface MongoEnv {
  uri: string;
  dbName: string;
}

export function getMongoEnv(): MongoEnv {
  const uri = required("MONGODB_URI");
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    throw new Error(
      "MONGODB_URI must start with mongodb:// or mongodb+srv://"
    );
  }
  const dbName = process.env.MONGODB_DB?.trim() || "dyne";
  return { uri, dbName };
}

export function getAuthSecret(): string {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.trim().length === 0) {
    if (isProd) {
      throw new Error(
        "Missing required environment variable AUTH_SECRET. See .env.example for documentation."
      );
    }
    // Development/test fallback. Never used in production (throws above).
    // eslint-disable-next-line no-console
    console.warn(
      "[dyne] AUTH_SECRET is not set; using an insecure development fallback. Set AUTH_SECRET for anything real."
    );
    return "dev-only-insecure-secret-do-not-use-in-production";
  }
  if (isProd && secret.trim().length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters in production.");
  }
  return secret;
}

export function getSiteUrl(requestOrigin?: string): string {
  return process.env.NEXT_PUBLIC_SITE_URL || requestOrigin || "http://localhost:3000";
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
