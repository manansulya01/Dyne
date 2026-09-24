import bcrypt from "bcryptjs";

/** bcrypt cost factor: strong enough for production, fast enough for tests. */
const COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  if (!password || !passwordHash) return false;
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch {
    return false;
  }
}
