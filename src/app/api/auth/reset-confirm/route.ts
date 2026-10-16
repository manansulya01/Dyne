import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { consumePasswordReset } from "@/lib/auth/passwordReset";
import { rateLimit, clientKey, RATE_PRESETS } from "@/lib/security/rateLimit";

const resetConfirmSchema = z
  .object({
    token: z.string().min(16, "Reset token is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/** Complete a forgot-password flow with the single-use reset token. */
export async function POST(request: Request) {
  const rl = rateLimit(`reset-confirm:${clientKey(request)}`, RATE_PRESETS.passwordReset.limit, RATE_PRESETS.passwordReset.windowMs);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as unknown;
  const validated = resetConfirmSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = await getDb();
  const result = await consumePasswordReset(db, validated.data.token, validated.data.password);

  if (!result.ok) {
    const message =
      result.reason === "weak"
        ? "Password must be at least 8 characters"
        : result.reason === "expired"
          ? "This reset link has expired. Request a new one."
          : "This reset link is invalid or has already been used.";
    return NextResponse.json({ error: { _form: [message] } }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
