"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getMission, missions } from "@/lib/missions";
import {
  getLocalAttemptsSnapshot,
  parseLocalAttempts,
  getRepeatedMistakePatterns,
  getWeakestConcepts,
  subscribeToLocalAttempts,
  suggestNextMissionId,
} from "@/lib/learner-patterns";

const CATEGORY_LABELS: Record<string, string> = {
  OFF_BY_ONE: "Off-by-one errors",
  INCORRECT_LOGIC: "Incorrect logic",
  SYNTAX_OR_RUNTIME: "Syntax or runtime errors",
  OUTPUT_FORMAT_MISMATCH: "Output format mismatch",
  UNKNOWN_ERROR: "Unresolved errors",
};

function readableCategory(category: string): string {
  return CATEGORY_LABELS[category]
    ?? category.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function LocalPatternsSection() {
  const snapshot = useSyncExternalStore(subscribeToLocalAttempts, getLocalAttemptsSnapshot, () => "");
  const attempts = parseLocalAttempts(snapshot);
  const patterns = getRepeatedMistakePatterns(2, attempts);
  const weakestConcepts = getWeakestConcepts(3, attempts);
  const completedIds = [...new Set(attempts.filter((attempt) => attempt.passed).map((attempt) => attempt.missionId))];
  const suggestedMissionId = suggestNextMissionId(missions, completedIds, attempts);
  const attemptCount = attempts.length;

  if (attemptCount === 0) return null;

  const suggestedMission = suggestedMissionId ? getMission(suggestedMissionId) : undefined;

  return (
    <section className="mt-6 rounded-2xl border border-[#292929] bg-[#101010] p-4 sm:p-5" aria-labelledby="local-patterns-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="local-patterns-heading" className="text-base font-semibold text-white">Your patterns · this browser</h2>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">{attemptCount} local runs</p>
      </div>
      <p className="mt-1 text-xs leading-5 text-neutral-500">
        Recurring mistakes across every mission you have attempted in this browser, plus the concepts to strengthen next.
      </p>

      {patterns.length > 0 ? (
        <div className="mt-4 space-y-2">
          {patterns.map((pattern) => (
            <div key={pattern.category} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#292929] bg-[#0a0a0a] px-3 py-3">
              <span className="text-sm text-neutral-200">{readableCategory(pattern.category)}</span>
              <span className="font-mono text-[10px] text-neutral-500">
                {pattern.occurrences}× across {pattern.missionIds.length} mission{pattern.missionIds.length === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">No mistake has repeated twice yet. Keep practicing.</p>
      )}

      {weakestConcepts.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">Concepts to strengthen</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {weakestConcepts.map((stat) => (
              <span key={stat.concept} className="rounded-lg border border-[#292929] bg-[#0a0a0a] px-3 py-1.5 text-xs text-neutral-300">
                {stat.concept} · {stat.attempts - stat.failures}/{stat.attempts} passed
              </span>
            ))}
          </div>
        </div>
      )}

      {suggestedMission && (
        <Link
          href={`/arena/${suggestedMission.id}`}
          className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Recommended next: {suggestedMission.title} ↗
        </Link>
      )}
    </section>
  );
}
