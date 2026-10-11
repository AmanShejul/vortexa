"use client";

import type { ExecutionMode, ExecutionSource, ExecutionStatus, HintSet } from "@/types";

const levels: Array<{ key: keyof HintSet; label: string; detail: string }> = [
  { key: "nudge", label: "Nudge", detail: "A small conceptual clue" },
  { key: "approach", label: "Approach", detail: "A way to frame the solution" },
  { key: "detailed", label: "Detailed guidance", detail: "A more explicit explanation" },
];

interface MentorPanelProps {
  dynamicHints?: Partial<HintSet>;
  revealedHintCount: number;
  hintCategory?: string;
  hintExplanation?: string;
  hintError?: string | null;
  hintLoading?: boolean;
  canRequestHint: boolean;
  executionMode?: ExecutionMode;
  executionStatus?: ExecutionStatus;
  executionSource?: ExecutionSource;
  onRequestHint: (level: number) => void;
}

function readableCategory(category: string): string {
  return category.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function MentorPanel({
  dynamicHints = {},
  revealedHintCount,
  hintCategory,
  hintExplanation,
  hintError,
  hintLoading = false,
  canRequestHint,
  executionMode,
  executionStatus,
  executionSource,
  onRequestHint,
}: MentorPanelProps) {
  const nextLevel = Math.min(revealedHintCount + 1, levels.length);
  const allRevealed = revealedHintCount >= levels.length;
  const hasPassed = executionSource === "live" && executionStatus === "passed" && executionMode === "submit";
  const publicExamplesPassed = executionStatus === "passed"
    && (executionSource === "local" || executionMode === "run");
  const isSimulated = executionStatus === "simulated";
  const isGeneralGuidance = isSimulated || executionSource === "local";

  return (
    <div className="space-y-3">
      {hasPassed && (
        <div className="rounded-xl border border-emerald-900/70 bg-emerald-950/30 px-4 py-3" role="status">
          <p className="text-sm font-semibold text-emerald-200">Mission passed</p>
          <p className="mt-1 text-xs leading-5 text-emerald-100/70">All required tests passed. You can review the test results or try another mission.</p>
        </div>
      )}
      {publicExamplesPassed && (
        <div className="rounded-xl border border-emerald-900/70 bg-emerald-950/20 px-4 py-3" role="status">
          <p className="text-sm font-semibold text-emerald-200">
            {executionSource === "local" ? "Local public examples passed" : "Public examples passed"}
          </p>
          <p className="mt-1 text-xs leading-5 text-emerald-100/70">
            {executionSource === "local"
              ? "Hidden tests were not run. This local result does not complete or save the mission."
              : "Submit to verify the complete mission test suite."}
          </p>
        </div>
      )}

      {isGeneralGuidance && (
        <div className="rounded-xl border border-amber-800/70 bg-amber-950/20 px-4 py-3" role="status">
          <p className="text-sm font-semibold text-amber-200">
            {isSimulated ? "General guidance only" : "Hints are not server-verified"}
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-100/70">
            {isSimulated
              ? "Demo feedback did not execute your code, so these hints are not a diagnosis of your submission."
              : "These deterministic hints are general guidance, not a server-verified diagnosis of local execution."}
          </p>
        </div>
      )}

      {!canRequestHint && !hasPassed && (
        <div className="rounded-xl border border-[#292929] bg-[#0b0b0b] px-4 py-3">
          <p className="text-sm font-medium text-neutral-300">
            {executionStatus === "execution_error"
              ? "Mentor guidance is unavailable for this execution."
              : isGeneralGuidance
                ? "Use general mission guidance in Demo mode."
                : executionStatus
                ? "Trusted mentor evidence is unavailable for this run. Run it again or check the server configuration."
              : "Run your code to unlock mentor guidance."}
          </p>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            {isGeneralGuidance
              ? "Guidance is general and does not rely on server-verified execution evidence."
              : "Hints are based on a trusted server execution result."}
          </p>
        </div>
      )}

      {hintExplanation && (
        <div className="rounded-xl border border-[#404040] bg-[#161616] px-4 py-3 text-sm leading-6 text-neutral-300">
          {hintCategory && (
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-400">
              Mistake pattern · {readableCategory(hintCategory)}
            </p>
          )}
          {hintExplanation}
        </div>
      )}

      {hintError && (
        <div role="alert" className="rounded-xl border border-rose-900/70 bg-rose-950/20 px-4 py-3 text-sm leading-6 text-rose-100">
          {hintError}
        </div>
      )}

      {levels.map((level, index) => {
        const isRevealed = index < revealedHintCount;
        const content = dynamicHints[level.key];
        return (
          <section
            key={level.key}
            aria-label={`${level.label}${isRevealed ? ", revealed" : ", locked"}`}
            className={`rounded-xl border p-4 transition-colors ${
              isRevealed ? "border-[#525252] bg-[#151515]" : "border-[#292929] bg-[#0b0b0b]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{index + 1}. {level.label}</p>
                <p className="mt-1 text-xs text-neutral-500">{level.detail}</p>
              </div>
              <span className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] ${isRevealed ? "text-neutral-300" : "text-neutral-600"}`}>
                {isRevealed ? "Revealed" : "Locked"}
              </span>
            </div>
            {isRevealed && (
              <p className="mt-3 border-t border-[#292929] pt-3 text-sm leading-6 text-neutral-300">
                {content}
              </p>
            )}
          </section>
        );
      })}

      <button
        type="button"
        onClick={() => onRequestHint(nextLevel)}
        disabled={hasPassed || allRevealed || hintLoading || !canRequestHint}
        className="w-full rounded-xl border border-[#525252] bg-[#181818] px-4 py-3 text-sm font-semibold text-white transition hover:border-[#737373] hover:bg-[#202020] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-[#292929] disabled:bg-[#101010] disabled:text-neutral-600"
      >
        {hintLoading
          ? "Getting hint…"
          : hasPassed
            ? "No hint needed — mission passed"
            : allRevealed
              ? "All guidance revealed"
              : !canRequestHint
                ? "Run code to unlock hints"
                : `Reveal ${levels[nextLevel - 1]?.label.toLowerCase() ?? "hint"}`}
      </button>
      <p className="text-center font-mono text-[10px] leading-5 text-neutral-600">
        {hasPassed
          ? "Guidance is deterministic and grounded in the verified server result."
          : isGeneralGuidance
            ? "One level at a time · general deterministic guidance"
            : "One level at a time · based on the latest trusted server result"}
      </p>
    </div>
  );
}
