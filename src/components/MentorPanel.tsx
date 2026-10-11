"use client";

import type { HintSet } from "@/types";

const levels: Array<{ key: keyof HintSet; label: string; detail: string }> = [
  { key: "nudge", label: "Nudge", detail: "A small conceptual clue" },
  { key: "approach", label: "Approach", detail: "A way to frame the solution" },
  { key: "detailed", label: "Detailed guidance", detail: "A more explicit explanation" }
];

interface MentorPanelProps {
  hints: HintSet;
  dynamicHints?: Partial<HintSet>;
  revealedHintCount: number;
  hintCategory?: string;
  hintExplanation?: string;
  hintError?: string | null;
  hintLoading?: boolean;
  canRequestHint: boolean;
  onRequestHint: (level: number) => void;
}

export function MentorPanel({
  hints,
  dynamicHints = {},
  revealedHintCount,
  hintCategory,
  hintExplanation,
  hintError,
  hintLoading = false,
  canRequestHint,
  onRequestHint
}: MentorPanelProps) {
  const nextLevel = Math.min(revealedHintCount + 1, levels.length);
  const allRevealed = revealedHintCount >= levels.length;

  return <div className="space-y-3">
    {hintExplanation && <div className="rounded-xl border border-[#404040] bg-[#161616] px-3 py-3 text-sm leading-6 text-neutral-300">
      {hintCategory && <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">{hintCategory}</p>}
      {hintExplanation}
    </div>}
    {hintError && <div role="alert" className="rounded-xl border border-[#737373] bg-[#161616] px-3 py-3 text-sm leading-6 text-neutral-200">{hintError}</div>}
    {levels.map((level, index) => {
      const isRevealed = index < revealedHintCount;
      const content = dynamicHints[level.key] ?? hints[level.key];
      return <div key={level.key} className={`rounded-xl border p-4 transition ${isRevealed ? "border-[#737373] bg-[#161616]" : "border-[#292929] bg-[#101010]"}`}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-sm font-semibold text-white">{index + 1}. {level.label}</p><p className="mt-1 text-xs text-neutral-500">{level.detail}</p></div>
          {isRevealed ? <span className="text-xs text-neutral-300">revealed</span> : <span className="font-mono text-xs text-neutral-600">locked</span>}
        </div>
        {isRevealed && <p className="mt-3 border-t border-[#292929] pt-3 text-sm leading-6 text-neutral-300">{content}</p>}
      </div>;
    })}
    <button type="button" onClick={() => onRequestHint(nextLevel)} disabled={allRevealed || hintLoading || !canRequestHint} className="w-full rounded-xl border border-[#737373] bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f1f1f] disabled:cursor-not-allowed disabled:border-[#292929] disabled:text-neutral-600">
      {hintLoading ? "Getting hint…" : allRevealed ? "All guidance revealed" : !canRequestHint ? "Run code to unlock hints" : `Get hint ${nextLevel}`}
    </button>
    <p className="text-center font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-600">Hints use the latest real execution result</p>
  </div>;
}
