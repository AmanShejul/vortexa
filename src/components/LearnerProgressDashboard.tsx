"use client";

import { useEffect, useState } from "react";
import type { ProgressSummary } from "@/types";

interface DashboardState {
  loading: boolean;
  error: string | null;
  data: ProgressSummary | null;
}

export function LearnerProgressDashboard() {
  const [state, setState] = useState<DashboardState>({ loading: true, error: null, data: null });

  useEffect(() => {
    let active = true;

    async function loadProgress() {
      try {
        const response = await fetch("/api/progress", { cache: "no-store" });
        const payload = await response.json().catch(() => null);

        if (!active) return;

        if (!response.ok) {
          setState({
            loading: false,
            error: payload?.error ?? "Unable to load your progress right now.",
            data: null,
          });
          return;
        }

        const summary = payload?.summary as ProgressSummary | undefined;
        setState({ loading: false, error: null, data: summary ?? null });
      } catch {
        if (active) {
          setState({ loading: false, error: "Unable to load your progress right now.", data: null });
        }
      }
    }

    void loadProgress();
    return () => {
      active = false;
    };
  }, []);

  if (state.loading) {
    return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div className="h-28 rounded-2xl border border-[#292929] bg-[#101010] animate-pulse" /><div className="h-28 rounded-2xl border border-[#292929] bg-[#101010] animate-pulse" /><div className="h-28 rounded-2xl border border-[#292929] bg-[#101010] animate-pulse" /><div className="h-28 rounded-2xl border border-[#292929] bg-[#101010] animate-pulse" /></div>;
  }

  if (state.error) {
    return <div className="rounded-2xl border border-[#737373] bg-[#101010] p-5 text-sm text-neutral-200">{state.error}</div>;
  }

  if (!state.data || state.data.empty) {
    return <div className="rounded-2xl border border-dashed border-[#292929] bg-[#101010] p-8 text-sm leading-7 text-neutral-500">No learner data has been recorded yet. Complete a mission to start tracking learning progress.</div>;
  }

  const { missionsCompleted, totalAttempts, successRate, recentAttempts, repeatedMistakes } = state.data;

  return <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-[#292929] bg-[#101010] p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">Missions completed</p>
        <p className="mt-4 text-3xl font-semibold text-white">{missionsCompleted}</p>
      </div>
      <div className="rounded-2xl border border-[#292929] bg-[#101010] p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">Total attempts</p>
        <p className="mt-4 text-3xl font-semibold text-white">{totalAttempts}</p>
      </div>
      <div className="rounded-2xl border border-[#292929] bg-[#101010] p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">Success rate</p>
        <p className="mt-4 text-3xl font-semibold text-white">{successRate.toFixed(0)}%</p>
      </div>
      <div className="rounded-2xl border border-[#292929] bg-[#101010] p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">Progress</p>
        <p className="mt-4 text-3xl font-semibold text-white">{state.data.currentLearningProgress}%</p>
      </div>
    </div>

    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-2xl border border-[#292929] bg-[#101010] p-5">
        <h3 className="text-lg font-semibold text-white">Recent attempts</h3>
        <div className="mt-4 space-y-3">
          {recentAttempts.length === 0 ? <p className="text-sm text-neutral-500">No recent attempts yet.</p> : recentAttempts.map((attempt) => (
            <div key={attempt.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#292929] bg-black px-3 py-2 text-sm text-neutral-300">
              <div>
                <p className="font-medium text-white">{attempt.missionId}</p>
                <p className="text-[11px] text-neutral-500">{attempt.mode} · {attempt.executionStatus}</p>
              </div>
              <span className="text-[11px] text-neutral-500">{attempt.passedTests}/{attempt.totalTests}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#292929] bg-[#101010] p-5">
        <h3 className="text-lg font-semibold text-white">Repeated mistakes</h3>
        <div className="mt-4 space-y-3">
          {repeatedMistakes.length === 0 ? <p className="text-sm text-neutral-500">No repeated mistake categories recorded.</p> : repeatedMistakes.map((mistake) => (
            <div key={`${mistake.category}-${mistake.missionId}`} className="rounded-xl border border-[#292929] bg-black px-3 py-2">
              <div className="flex items-center justify-between gap-4"><span className="text-sm text-white">{mistake.category}</span><span className="font-mono text-[10px] text-neutral-500">{mistake.occurrenceCount}x</span></div>
              <p className="mt-1 text-[11px] text-neutral-500">{mistake.missionId}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>;
}
