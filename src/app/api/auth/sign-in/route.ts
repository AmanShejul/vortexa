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

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
    }

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return NextResponse.json({ ok: false, error: error?.message ?? "Sign-in failed." }, { status: 401 });
    }

    return NextResponse.json({ ok: true, user: { id: data.user.id, email: data.user.email } });
  } catch {
    return NextResponse.json({ ok: false, error: "Sign-in request is invalid." }, { status: 400 });
  }
}
