import { ObjectId } from "mongodb";
import { z } from "zod";

/** True if the value is a 24-hex-char MongoDB ObjectId string. */
export function isObjectIdString(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);
}

/** Parse an unknown value into an ObjectId, throwing a safe Error on failure. */
export function toObjectId(value: unknown, label = "id"): ObjectId {
  if (value instanceof ObjectId) return value;
  if (isObjectIdString(value)) return new ObjectId(value);
  throw new Error(`Invalid ${label}: expected a 24-character hex ObjectId string`);
}

/** Zod schema for ObjectId strings (replaces z.string().uuid() across the API). */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid id format");

/** Serialize a Mongo _id (or doc containing one) for JSON API responses. */
export function idString(id: ObjectId | string): string {
  return typeof id === "string" ? id : id.toHexString();
}

export function newId(): ObjectId {
  return new ObjectId();
}

/** Current timestamp (single helper so created/updated handling stays uniform). */
export function now(): Date {
  return new Date();
}
