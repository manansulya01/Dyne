import type { Metadata } from "next";
import { Suspense } from "react";
import ResetPasswordForm from "../reset-password/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Update password - Dyne",
  description: "Set a new password for your Dyne account",
};

/**
 * Forced-rotation screen.
 *
 * `/api/auth/login` and the dashboard layout both send an account flagged
 * `mustChangePassword` here, and the password-reset email link points at the
 * same route with a token. It intentionally reuses the reset form: with no
 * token it rotates the password for the signed-in session, and with a token it
 * completes the emailed flow. No password is ever displayed or sent back.
 */
export default function UpdatePasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4 py-12">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}