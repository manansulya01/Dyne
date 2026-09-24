import { ObjectId } from "mongodb";

type MaybeOid = ObjectId | string | null | undefined;

/** Convert ObjectId fields to hex strings for JSON API responses. */
export function oid(value: MaybeOid): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : value.toHexString();
}

function convertDates<T>(value: T): T {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(convertDates) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v instanceof ObjectId) out[k === "_id" ? "id" : k] = v.toHexString();
      else out[k === "_id" ? "id" : k] = convertDates(v);
    }
    return out as T;
  }
  return value;
}

/** Serialize a Mongo document: _id -> id (hex), nested ObjectIds -> hex. */
export function serialize<T>(doc: T): T {
  return convertDates(doc);
}

export function serializeMany<T>(docs: T[]): T[] {
  return docs.map(serialize);
}
