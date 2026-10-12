"use client";

import Link from "next/link";
import type { LearnerAnalytics } from "@/lib/adaptive-learner";

const CATEGORY_LABELS: Record<string, string> = {
  OFF_BY_ONE: "Off-by-one boundaries",
  EMPTY_INPUT_UNHANDLED: "Empty-input handling",
  INCORRECT_CONDITIONAL_LOGIC: "Conditional logic",
  ALGORITHMIC_REASONING: "Algorithmic reasoning",
  INCORRECT_LOGIC: "Incorrect logic",
  OUTPUT_FORMAT_MISMATCH: "Output format",
  SYNTAX_ERROR: "Syntax errors",
  RUNTIME_ERROR: "Runtime errors",
  TIMEOUT: "Non-terminating or slow code",
};

function readableCategory(category: string): string {
  return CATEGORY_LABELS[category]
    ?? category.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function proficiencyLabel(value: string): string {
  if (value === "insufficient_evidence") return "Not enough evidence";
  if (value === "needs_practice") return "Needs practice";
  if (value === "strong") return "Strong signal";
  return "Developing";
}

export function AdaptiveLearnerSection({ data, scopeLabel }: { data: LearnerAnalytics; scopeLabel: string }) {
  const hasHistory = data.recentLearningProgress.length > 0;
  const recurringPatterns = data.mistakePatterns.filter((pattern) => pattern.isRecurring);
  const recommendation = data.recommendations[0];

  return (
    <section className="mt-6 rounded-2xl border border-[#292929] bg-[#101010] p-4 sm:p-5" aria-labelledby="learning-dna-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">Adaptive learner intelligence · {scopeLabel}</p>
          <h2 id="learning-dna-heading" className="mt-1 text-xl font-semibold text-white">My Learning DNA</h2>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">Evidence-based signals</p>
      </div>

      {!hasHistory ? (
        <div className="mt-4 rounded-xl border border-dashed border-[#353535] bg-[#0a0a0a] px-4 py-4">
          <p className="text-sm font-semibold text-white">Your learning profile starts with your first run</p>
          <p className="mt-1 text-sm leading-6 text-neutral-500">No learner metrics are shown yet. Complete a mission attempt to build concept evidence and recommendations.</p>
          {recommendation && (
            <Link href={`/arena/${recommendation.missionId}`} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-[#525252] px-3 text-xs font-semibold text-white transition hover:bg-[#1b1b1b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Start with {recommendation.title}
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <section className="rounded-xl border border-[#292929] bg-[#0a0a0a] p-4" aria-labelledby="concept-signals-heading">
              <div className="flex items-center justify-between gap-3">
                <h3 id="concept-signals-heading" className="text-sm font-semibold text-white">Concept signals</h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-600">Attempts, not guesses</span>
              </div>
              <div className="mt-3 space-y-3">
                {data.conceptStats.length === 0 ? (
                  <p className="text-sm text-neutral-500">Concept evidence is not available yet.</p>
                ) : data.conceptStats.slice(0, 6).map((stat) => (
                  <div key={stat.concept}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-neutral-200">{stat.concept}</span>
                      <span className="font-mono text-[10px] text-neutral-500">{proficiencyLabel(stat.proficiency)} · {stat.sampleSize} sample{stat.sampleSize === 1 ? "" : "s"}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#292929]" aria-hidden="true">
                      <div className="h-full rounded-full bg-neutral-300" style={{ width: `${stat.successRate ?? 0}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-neutral-600">{stat.explanation}{stat.trend === "improving" ? " Recent results are improving." : ""}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-[#292929] bg-[#0a0a0a] p-4" aria-labelledby="mistake-patterns-heading">
              <h3 id="mistake-patterns-heading" className="text-sm font-semibold text-white">Repeated patterns</h3>
              <div className="mt-3 space-y-2">
                {recurringPatterns.length === 0 ? (
                  <p className="text-sm leading-6 text-neutral-500">No mistake pattern has repeated across recorded attempts yet.</p>
                ) : recurringPatterns.slice(0, 4).map((pattern) => (
                  <div key={pattern.category} className="rounded-lg border border-[#292929] px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-neutral-200">{readableCategory(pattern.category)}</span>
                      <span className="font-mono text-[10px] text-neutral-500">{pattern.occurrences} occurrences</span>
                    </div>
                    <p className="mt-1 text-[11px] text-neutral-600">
                      {pattern.improving ? "Recent evidence suggests improvement." : `Seen across ${pattern.missionIds.length} mission${pattern.missionIds.length === 1 ? "" : "s"}.`}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <section className="rounded-xl border border-[#292929] bg-[#0a0a0a] p-4" aria-labelledby="recommendation-heading">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">Recommended next</p>
              {recommendation ? (
                <>
                  <h3 id="recommendation-heading" className="mt-1 text-base font-semibold text-white">{recommendation.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-neutral-400">{recommendation.explanation}</p>
                  <Link href={`/arena/${recommendation.missionId}`} className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-white px-3 text-xs font-semibold text-black transition hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                    Open mission
                  </Link>
                </>
              ) : (
                <p id="recommendation-heading" className="mt-1 text-sm leading-6 text-neutral-500">You have completed every available mission in the catalogue. Revision is optional and is not counted as a new recommendation.</p>
              )}
            </section>

            <section className="rounded-xl border border-[#292929] bg-[#0a0a0a] p-4" aria-labelledby="recent-learning-heading">
              <h3 id="recent-learning-heading" className="text-sm font-semibold text-white">Recent learning progress</h3>
              <div className="mt-3 space-y-2">
                {data.recentLearningProgress.slice(0, 4).map((progress) => (
                  <div key={progress.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-neutral-300">{progress.title}</span>
                    <span className="shrink-0 font-mono text-[10px] text-neutral-500">{progress.passedTests}/{progress.totalTests} · {progress.status.replaceAll("_", " ")}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
