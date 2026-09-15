import { createClient } from "@/lib/supabase/server";
import { resetPasswordSchema } from "@/lib/validation";
import { NextResponse } from "next/server";

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
  
  const supabase = await createClient();

  // Fall back to the request origin when NEXT_PUBLIC_SITE_URL is unset so the
  // redirect never becomes "undefined/reset-password".
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  const { error } = await supabase.auth.resetPasswordForEmail(validated.data.email, {
    redirectTo: `${siteUrl}/reset-password`,
  });
  
  if (error) {
    return NextResponse.json(
      { error: { _form: [error.message] } },
      { status: 400 }
    );
  }
  
  return NextResponse.json({ success: true });
}