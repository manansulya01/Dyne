import { createClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/validation";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  
  const validated = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    username: formData.get("username"),
    displayName: formData.get("displayName"),
  });
  
  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  
  const supabase = await createClient();
  
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: validated.data.email,
    password: validated.data.password,
    options: {
      data: {
        username: validated.data.username,
        display_name: validated.data.displayName,
      },
    },
  });
  
  if (authError) {
    return NextResponse.json(
      { error: { _form: [authError.message] } },
      { status: 400 }
    );
  }
  
  if (authData.user) {
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: authData.user.id,
        username: validated.data.username,
        display_name: validated.data.displayName,
        role: "student",
      });
    
    if (profileError) {
      return NextResponse.json(
        { error: { _form: ["Failed to create profile. Please try again."] } },
        { status: 500 }
      );
    }
  }
  
  return NextResponse.json({ success: true });
}