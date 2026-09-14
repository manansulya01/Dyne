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
  
  const { error } = await supabase.auth.resetPasswordForEmail(validated.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
  });
  
  if (error) {
    return NextResponse.json(
      { error: { _form: [error.message] } },
      { status: 400 }
    );
  }
  
  return NextResponse.json({ success: true });
}