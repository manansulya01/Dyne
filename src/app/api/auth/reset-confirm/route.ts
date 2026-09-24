import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { consumePasswordReset } from "@/lib/auth/passwordReset";

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
