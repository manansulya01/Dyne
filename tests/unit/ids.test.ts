import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { isObjectIdString, toObjectId, objectIdSchema, idString } from "@/lib/mongo/ids";

describe("object id helpers", () => {
  it("validates 24-hex strings only", () => {
    expect(isObjectIdString("507f1f77bcf86cd799439011")).toBe(true);
    expect(isObjectIdString("507F1F77BCF86CD799439011")).toBe(true);
    expect(isObjectIdString("not-an-id")).toBe(false);
    expect(isObjectIdString("507f1f77bcf86cd79943901")).toBe(false);
    expect(isObjectIdString("507f1f77bcf86cd79943901zz")).toBe(false);
    expect(isObjectIdString(null)).toBe(false);
    expect(isObjectIdString(123)).toBe(false);
  });

  it("parses valid ids and rejects the rest without leaking input", () => {
    const oid = toObjectId("507f1f77bcf86cd799439011");
    expect(oid).toBeInstanceOf(ObjectId);
    expect(() => toObjectId("nope")).toThrowError(/Invalid id/);
    expect(() => toObjectId(null)).toThrowError();
  });

  it("exposes a zod schema for route params", () => {
    expect(objectIdSchema.safeParse("507f1f77bcf86cd799439011").success).toBe(true);
    expect(objectIdSchema.safeParse("nope").success).toBe(false);
  });

  it("serializes ids to hex strings", () => {
    const oid = new ObjectId("507f1f77bcf86cd799439011");
    expect(idString(oid)).toBe("507f1f77bcf86cd799439011");
    expect(idString("507f1f77bcf86cd799439011")).toBe("507f1f77bcf86cd799439011");
  });
});
