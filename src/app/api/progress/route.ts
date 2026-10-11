import { NextResponse } from "next/server";
import { getAuthenticatedUser, isSupabaseConfigured } from "@/lib/supabase";
import { getProgressSummary } from "@/lib/learner-persistence";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: true,
      summary: {
        missionsCompleted: 0,
        totalAttempts: 0,
        successRate: 0,
        currentLearningProgress: 0,
        recentAttempts: [],
        repeatedMistakes: [],
        empty: true,
      },
    });
  }

  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  try {
    const summary = await getProgressSummary(user.id);
    return NextResponse.json({ ok: true, summary: summary ?? {
      missionsCompleted: 0,
      totalAttempts: 0,
      successRate: 0,
      currentLearningProgress: 0,
      recentAttempts: [],
      repeatedMistakes: [],
      empty: true,
    } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Progress lookup failed." }, { status: 503 });
  }
}
