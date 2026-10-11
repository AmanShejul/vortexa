import { NextResponse } from "next/server";
import { createSupabaseAnonClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const client = createSupabaseAnonClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ ok: false, error: "Password must be at least eight characters long." }, { status: 400 });
    }

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName || email.split("@")[0],
        },
      },
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, user: data.user ? { id: data.user.id, email: data.user.email } : null });
  } catch {
    return NextResponse.json({ ok: false, error: "Sign-up request is invalid." }, { status: 400 });
  }
}
