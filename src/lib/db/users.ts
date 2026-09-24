import { Db, ObjectId } from "mongodb";
import { col, type UserDoc, type UserRole } from "@/lib/mongo/collections";
import { hashPassword } from "@/lib/auth/password";
import { toObjectId } from "@/lib/mongo/ids";

export interface CreateUserInput {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

export type CreateUserResult =
  | { ok: true; userId: ObjectId }
  | { ok: false; reason: "email_taken" | "username_taken" };

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

/** Create a user with hashed password. Detects email vs username conflicts. */
export async function createUser(db: Db, input: CreateUserInput): Promise<CreateUserResult> {
  const email = normalizeEmail(input.email);
  const users = col<UserDoc>(db, "users");

  const clash = await users.findOne({
    $or: [{ email }, { username: input.username }],
  } as never);
  if (clash) {
    return { ok: false, reason: clash.email === email ? "email_taken" : "username_taken" };
  }

  const now = new Date();
  try {
    const res = await users.insertOne({
      email,
      passwordHash: await hashPassword(input.password),
      username: input.username,
      displayName: input.displayName,
      avatarUrl: null,
      bio: null,
      role: "student" as UserRole,
      classGrade: null,
      house: null,
      interests: [],
      emailVerifiedAt: null,
      suspendedUntil: null,
      createdAt: now,
      updatedAt: now,
    } as never);
    return { ok: true, userId: res.insertedId };
  } catch (err: unknown) {
    // Race on unique indexes: re-read to classify the conflict.
    if (err instanceof Error && /duplicate key/i.test(err.message)) {
      const again = await users.findOne({
        $or: [{ email }, { username: input.username }],
      } as never);
      if (again) {
        return { ok: false, reason: again.email === email ? "email_taken" : "username_taken" };
      }
    }
    throw err;
  }
}

export async function findUserByEmail(db: Db, email: string) {
  return col<UserDoc>(db, "users").findOne({ email: normalizeEmail(email) } as never);
}

export async function findUserById(db: Db, id: string | ObjectId) {
  return col<UserDoc>(db, "users").findOne({ _id: toObjectId(id) } as never);
}

export async function findUserByUsername(db: Db, username: string) {
  return col<UserDoc>(db, "users").findOne({ username } as never);
}

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  coverImageUrl?: string | null;
  accent?: string | null;
  classGrade?: string | null;
  house?: string | null;
  interests?: string[];
}

/** Update a user's own editable profile fields. Returns the updated doc. */
export async function updateOwnProfile(db: Db, userId: string | ObjectId, input: UpdateProfileInput) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.bio !== undefined) patch.bio = input.bio;
  if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;
  if (input.coverImageUrl !== undefined) patch.coverImageUrl = input.coverImageUrl || null;
  if (input.accent !== undefined) patch.accent = input.accent || null;
  if (input.classGrade !== undefined) patch.classGrade = input.classGrade;
  if (input.house !== undefined) patch.house = input.house;
  if (input.interests !== undefined) patch.interests = input.interests.slice(0, 10);

  const res = await col<UserDoc>(db, "users").findOneAndUpdate(
    { _id: toObjectId(userId) } as never,
    { $set: patch },
    { returnDocument: "after" }
  );
  return res;
}

export async function setUserRole(db: Db, userId: string | ObjectId, role: UserRole): Promise<boolean> {
  const res = await col<UserDoc>(db, "users").updateOne(
    { _id: toObjectId(userId) } as never,
    { $set: { role, updatedAt: new Date() } }
  );
  return res.matchedCount === 1;
}

/** True while the account's suspension is in effect (temp or permanent ban). */
export function isSuspended(user: Pick<UserDoc, "suspendedUntil"> | null | undefined): boolean {
  return !!user?.suspendedUntil && user.suspendedUntil.getTime() > Date.now();
}

/** Suspend a user until `until` (perm bans pass a far-future date). */
export async function suspendUser(
  db: Db,
  userId: string | ObjectId,
  until: Date
): Promise<boolean> {
  const res = await col<UserDoc>(db, "users").updateOne(
    { _id: toObjectId(userId) } as never,
    { $set: { suspendedUntil: until, updatedAt: new Date() } }
  );
  return res.matchedCount === 1;
}

/** Lift a suspension early (appeals / mistaken bans). */
export async function unsuspendUser(db: Db, userId: string | ObjectId): Promise<boolean> {
  const res = await col<UserDoc>(db, "users").updateOne(
    { _id: toObjectId(userId) } as never,
    { $set: { suspendedUntil: null, updatedAt: new Date() } }
  );
  return res.matchedCount === 1;
}

export async function setPasswordHash(db: Db, userId: string | ObjectId, password: string): Promise<void> {
  await col<UserDoc>(db, "users").updateOne(
    { _id: toObjectId(userId) } as never,
    { $set: { passwordHash: await hashPassword(password), updatedAt: new Date() } }
  );
}

/** Follow helpers live here (single writer for the follows collection). */
export async function followUser(db: Db, followerId: string | ObjectId, followingId: string | ObjectId) {
  const follower = toObjectId(followerId);
  const following = toObjectId(followingId);
  if (follower.equals(following)) {
    return { ok: false as const, reason: "self" as const };
  }
  const target = await col<UserDoc>(db, "users").findOne({ _id: following } as never);
  if (!target) return { ok: false as const, reason: "not_found" as const };
  try {
    await col(db, "follows").insertOne({ followerId: follower, followingId: following, createdAt: new Date() } as never);
    return { ok: true as const };
  } catch (err: unknown) {
    if (err instanceof Error && /duplicate key/i.test(err.message)) {
      return { ok: false as const, reason: "already" as const };
    }
    throw err;
  }
}

export async function unfollowUser(db: Db, followerId: string | ObjectId, followingId: string | ObjectId) {
  await col(db, "follows").deleteOne({
    followerId: toObjectId(followerId),
    followingId: toObjectId(followingId),
  } as never);
  return { ok: true as const };
}

export async function followCounts(db: Db, userId: string | ObjectId) {
  const id = toObjectId(userId);
  const [followers, following] = await Promise.all([
    col(db, "follows").countDocuments({ followingId: id } as never),
    col(db, "follows").countDocuments({ followerId: id } as never),
  ]);
  return { followers, following };
}

export async function isFollowing(db: Db, followerId: string | ObjectId, followingId: string | ObjectId) {
  const row = await col(db, "follows").findOne({
    followerId: toObjectId(followerId),
    followingId: toObjectId(followingId),
  } as never);
  return !!row;
}
