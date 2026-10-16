import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { resetPasswordSchema } from "@/lib/validation";
import { findUserByEmail } from "@/lib/db/users";
import { readFormData } from "@/lib/utils";
import { rateLimit, clientKey, RATE_PRESETS } from "@/lib/security/rateLimit";
import { getPasswordResetMailer, issuePasswordReset } from "@/lib/auth/passwordReset";

export async function POST(request: Request) {
  const rl = rateLimit(`reset:${clientKey(request)}`, RATE_PRESETS.passwordReset.limit, RATE_PRESETS.passwordReset.windowMs);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const formData = await readFormData(request);
  if (!formData) {
    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  }

  const validated = resetPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = await getDb();
  // Never reveal whether the email exists (no account enumeration).
  const user = await findUserByEmail(db, validated.data.email);
  if (user) {
    await issuePasswordReset(db, user._id, getPasswordResetMailer(), user.email);
  }

  return NextResponse.json({ success: true });
}
