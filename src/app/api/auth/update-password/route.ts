import { createClient } from "@/lib/supabase/server";
import { updatePasswordSchema } from "@/lib/validation";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  
  const validated = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  
  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  
  const supabase = await createClient();
  
  const { error } = await supabase.auth.updateUser({
    password: validated.data.password,
  });
  
  if (error) {
    return NextResponse.json(
      { error: { _form: [error.message] } },
      { status: 400 }
    );
  }
  
  return NextResponse.json({ success: true });
}