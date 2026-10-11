import { NextResponse } from "next/server";
import { getAuthenticatedUser, isSupabasePersistenceConfigured } from "@/lib/supabase";
import { getProgressSummary } from "@/lib/learner-persistence";

export async function GET(request: Request) {
  if (!isSupabasePersistenceConfigured()) {
    return NextResponse.json({ ok: false, error: "Saved progress is not configured." }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  try {
    const summary = await getProgressSummary(user.id);
    if (!summary) {
      return NextResponse.json({ ok: false, error: "Saved progress is unavailable." }, { status: 503 });
    }
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Progress lookup failed." }, { status: 503 });
  }
}
