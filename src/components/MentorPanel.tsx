"use client";

import { useState } from "react";
import type { HintSet } from "@/types";

const levels: Array<{ key: keyof HintSet; label: string; detail: string }> = [{ key: "nudge", label: "Nudge", detail: "A small conceptual clue" }, { key: "approach", label: "Approach", detail: "A way to frame the solution" }, { key: "detailed", label: "Detailed guidance", detail: "A more explicit explanation" }];

export function MentorPanel({ hints }: { hints: HintSet }) {
  const [revealed, setRevealed] = useState(0);
  return <div className="space-y-3">{levels.map((level, index) => { const isRevealed = index < revealed; return <div key={level.key} className={`rounded-xl border p-4 transition ${isRevealed ? "border-[#737373] bg-[#161616]" : "border-[#292929] bg-[#101010]"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">{index + 1}. {level.label}</p><p className="mt-1 text-xs text-neutral-500">{level.detail}</p></div>{isRevealed ? <span className="text-xs text-neutral-300">revealed</span> : <span className="font-mono text-xs text-neutral-600">locked</span>}</div>{isRevealed && <p className="mt-3 border-t border-[#292929] pt-3 text-sm leading-6 text-neutral-300">{hints[level.key]}</p>}</div>; })}<button type="button" onClick={() => setRevealed((value) => Math.min(value + 1, levels.length))} disabled={revealed >= levels.length} className="w-full rounded-xl border border-[#737373] bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f1f1f] disabled:cursor-not-allowed disabled:border-[#292929] disabled:text-neutral-600">{revealed >= levels.length ? "All guidance revealed" : `Reveal hint ${revealed + 1}`}</button><p className="text-center font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-600">Demo hint content · mentor engine not connected</p></div>;
}
