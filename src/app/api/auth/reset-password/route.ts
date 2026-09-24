import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { resetPasswordSchema } from "@/lib/validation";
import { findUserByEmail } from "@/lib/db/users";
import { consoleMailer, issuePasswordReset } from "@/lib/auth/passwordReset";

export async function POST(request: Request) {
  const formData = await request.formData();

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
    await issuePasswordReset(db, user._id, consoleMailer, user.email);
  }

  return NextResponse.json({ success: true });
}
