"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { getMission } from "@/lib/missions";
import { AdaptiveLearnerSection } from "@/components/AdaptiveLearnerSection";
import type { ProgressSummary } from "@/types";

type DashboardState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "unavailable" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ProgressSummary };

export function LearnerProgressDashboard() {
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadProgress() {
      const clientInstance = createSupabaseBrowserClient();
      if (!clientInstance) {
        await Promise.resolve();
        if (active) setState({ status: "unavailable" });
        return;
      }

      try {
        const { data, error: sessionError } = await clientInstance.auth.getSession();
        if (!active) return;
        if (sessionError) {
          setState({ status: "error", message: "Your sign-in session could not be checked. Please sign in again." });
          return;
        }

        const accessToken = data.session?.access_token;
        if (!accessToken) {
          setState({ status: "signed-out" });
          return;
        }

        const response = await fetch("/api/progress", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const payload = await response.json().catch(() => null) as {
          summary?: ProgressSummary;
          error?: string;
        } | null;
        if (!active) return;

        if (response.status === 401) {
          setState({ status: "signed-out" });
          return;
        }
        if (response.status === 503 && payload?.error === "Saved progress is not configured.") {
          setState({ status: "unavailable" });
          return;
        }
        if (!response.ok) {
          setState({
            status: "error",
            message: payload?.error ?? "We couldn't load saved progress. Please try again.",
          });
          return;
        }
        if (!payload?.summary || typeof payload.summary.totalAttempts !== "number" || !Array.isArray(payload.summary.recentAttempts)
          || !Array.isArray(payload.summary.conceptStats) || !Array.isArray(payload.summary.recommendations)) {
          setState({ status: "error", message: "The progress service returned an invalid response. Please try again." });
          return;
        }

        setState({ status: "ready", data: payload.summary });
      } catch {
        if (active) {
          setState({ status: "error", message: "We couldn't reach the progress service. Check your connection and try again." });
        }
      }
    }

    void loadProgress();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (state.status === "loading") {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Loading progress">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl border border-[#292929] bg-[#101010]" />
        ))}
      </div>
    );
  }

  if (state.status === "signed-out") {
    return (
      <div className="rounded-2xl border border-[#292929] bg-[#101010] p-6 sm:p-8">
        <p className="text-sm font-semibold text-white">Sign in to view saved progress</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">Your dashboard shows attempts and completed missions associated with your account.</p>
        <Link href="/auth" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          Sign in
        </Link>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="rounded-2xl border border-[#292929] bg-[#101010] p-6 sm:p-8">
        <p className="text-sm font-semibold text-white">Account-synced progress is optional</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">
          Connect Supabase to save attempts to an account. Local Python practice still works, and browser-only practice patterns appear below when available.
        </p>
        <Link href="/missions" className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-[#525252] px-4 text-sm font-semibold text-white transition hover:bg-[#1b1b1b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          Browse missions
        </Link>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl border border-rose-900/70 bg-[#101010] p-5 sm:p-6" role="alert">
        <p className="text-sm leading-6 text-rose-100">{state.message}</p>
        <button
          type="button"
          onClick={() => {
            setState({ status: "loading" });
            setRefreshKey((current) => current + 1);
          }}
          className="mt-4 min-h-10 rounded-lg border border-[#525252] px-3 text-xs font-semibold text-white transition hover:bg-[#1b1b1b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state.data.empty) {
    return (
      <>
        <div className="rounded-2xl border border-dashed border-[#353535] bg-[#101010] p-6 sm:p-8">
          <p className="text-sm font-semibold text-white">No saved progress yet</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">Your dashboard will fill in after an authenticated mission run is recorded. Start with the suggested beginner mission below to create your first evidence.</p>
          <Link href="/missions" className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-[#525252] px-4 text-sm font-semibold text-white transition hover:bg-[#1b1b1b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            Browse missions
          </Link>
        </div>
        <AdaptiveLearnerSection data={state.data} scopeLabel="account synced" />
      </>
    );
  }

  const { missionsCompleted, totalAttempts, successRate, recentAttempts, repeatedMistakes } = state.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Missions completed" value={missionsCompleted} />
        <Metric label="Total attempts" value={totalAttempts} />
        <Metric label="Success rate" value={`${successRate.toFixed(0)}%`} />
        <Metric label="Learning progress" value={`${state.data.currentLearningProgress}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="min-w-0 rounded-2xl border border-[#292929] bg-[#101010] p-4 sm:p-5" aria-labelledby="recent-attempts-heading">
          <h2 id="recent-attempts-heading" className="text-base font-semibold text-white">Recent attempts</h2>
          <div className="mt-4 space-y-2">
            {recentAttempts.length === 0 ? (
              <p className="text-sm text-neutral-500">No recent attempts yet.</p>
            ) : recentAttempts.map((attempt) => (
              <div key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#292929] bg-[#0a0a0a] px-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="break-words font-medium text-white">{getMission(attempt.missionId)?.title ?? attempt.missionId}</p>
                  <p className="mt-1 text-xs text-neutral-500">{attempt.mode} · {attempt.executionStatus.replaceAll("_", " ")}</p>
                </div>
                <span className="shrink-0 font-mono text-xs text-neutral-400">{attempt.passedTests}/{attempt.totalTests}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-[#292929] bg-[#101010] p-4 sm:p-5" aria-labelledby="repeated-mistakes-heading">
          <h2 id="repeated-mistakes-heading" className="text-base font-semibold text-white">Repeated mistakes</h2>
          <div className="mt-4 space-y-2">
            {repeatedMistakes.length === 0 ? (
              <p className="text-sm leading-6 text-neutral-500">No repeated mistake categories have been recorded.</p>
            ) : repeatedMistakes.map((mistake) => (
              <div key={`${mistake.category}-${mistake.missionId}`} className="rounded-xl border border-[#292929] bg-[#0a0a0a] px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-neutral-200">{mistake.category.replaceAll("_", " ").toLowerCase()}</span>
                  <span className="font-mono text-[10px] text-neutral-500">{mistake.occurrenceCount} recorded</span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">{getMission(mistake.missionId)?.title ?? mistake.missionId}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
      <AdaptiveLearnerSection data={state.data} scopeLabel="account synced" />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-[#292929] bg-[#101010] p-4 sm:p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}
