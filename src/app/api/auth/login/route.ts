import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  
  const validated = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  
  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  
  const supabase = await createClient();
  
  const { error } = await supabase.auth.signInWithPassword({
    email: validated.data.email,
    password: validated.data.password,
  });
  
  if (error) {
    return NextResponse.json(
      { error: { _form: [error.message] } },
      { status: 401 }
    );
  }
  
  return NextResponse.json({ success: true });
}