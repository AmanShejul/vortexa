"use client";

import Link from "next/link";
import { useState } from "react";
import { CodeEditor } from "@/components/CodeEditor";
import { MentorPanel } from "@/components/MentorPanel";
import { TestResults } from "@/components/TestResults";
import { executeMission } from "@/lib/execution-client";
import type { ExecutionMode, ExecutionResult, HintSet, MentorResponse, Mission } from "@/types";

export function ArenaWorkspace({ mission }: { mission: Mission }) {
  const [code, setCode] = useState(mission.starterCode);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [running, setRunning] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [mentorHints, setMentorHints] = useState<Partial<HintSet>>({});
  const [revealedHintCount, setRevealedHintCount] = useState(0);
  const [hintCategory, setHintCategory] = useState<string | undefined>();
  const [hintExplanation, setHintExplanation] = useState<string | undefined>();
  const [hintError, setHintError] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  async function run(mode: ExecutionMode) {
    if (running) return;
    setRunning(true);
    setResult(null);
    setRequestError(null);
    setMentorHints({});
    setRevealedHintCount(0);
    setHintCategory(undefined);
    setHintExplanation(undefined);
    setHintError(null);
    try {
      setResult(await executeMission(mission.id, code, mode));
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The execution request failed.");
    } finally {
      setRunning(false);
    }
  }

  function resetCode() {
    setCode(mission.starterCode);
    setResult(null);
    setRequestError(null);
    setMentorHints({});
    setRevealedHintCount(0);
    setHintCategory(undefined);
    setHintExplanation(undefined);
    setHintError(null);
  }

  async function requestHint(level: number) {
    if (hintLoading) return;
    if (!result || result.isMock) {
      setHintError("Run your code first so the mentor can use real execution evidence.");
      return;
    }

    setHintLoading(true);
    setHintError(null);
    try {
      const response = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          sourceCode: code,
          executionResult: result,
          attemptId: result.attemptId,
          hintLevel: level
        })
      });
      const payload = await response.json().catch(() => null) as (MentorResponse & { error?: string }) | null;
      if (!response.ok) throw new Error(payload?.error || "The mentor request failed.");
      if (!payload || typeof payload.hint !== "string" || typeof payload.category !== "string") {
        throw new Error("The mentor returned an invalid response.");
      }

      const keys: Array<keyof HintSet> = ["nudge", "approach", "detailed"];
      setMentorHints((current) => ({ ...current, [keys[level - 1]]: payload.hint }));
      setRevealedHintCount((current) => Math.max(current, level));
      setHintCategory(payload.category);
      setHintExplanation(payload.explanation);
    } catch (error) {
      setHintError(error instanceof Error ? error.message : "The mentor request failed.");
    } finally {
      setHintLoading(false);
    }
  }

  return <div className="min-h-screen bg-[#080808] text-neutral-200">
    <header className="sticky top-0 z-40 border-b border-[#292929] bg-[#080808]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-[min(1440px,calc(100%-32px))] items-center justify-between gap-4">
        <Link href="/missions" className="text-sm text-neutral-400 transition hover:text-white">← Missions</Link>
        <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 sm:flex"><span className="size-1.5 rounded-full bg-white" /> Judge0 execution</div>
        <span className="text-xs text-neutral-500">{mission.category} / {mission.difficulty}</span>
      </div>
    </header>
    <main className="mx-auto w-[min(1440px,calc(100%-32px))] py-7">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">Mission workspace</p><h1 className="text-3xl font-semibold tracking-[-0.04em] text-white">{mission.title}</h1></div>
        <div className="flex gap-2"><button type="button" onClick={resetCode} className="rounded-xl border border-[#404040] bg-black px-3 py-2 text-xs text-white transition hover:bg-[#1f1f1f]">Reset code</button><button type="button" onClick={() => run("run")} disabled={running} className="rounded-xl border border-[#737373] bg-black px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1f1f1f] disabled:cursor-not-allowed disabled:border-[#292929] disabled:text-neutral-600">{running ? "Running…" : "Run"}</button><button type="button" onClick={() => run("submit")} disabled={running} className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-[#292929] disabled:text-neutral-600">Submit</button></div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="rounded-2xl border border-[#292929] bg-[#101010] p-5">
          <div className="mb-6 flex flex-wrap gap-2">{mission.concepts.map((concept) => <span key={concept} className="rounded-md border border-[#404040] bg-[#161616] px-2 py-1 text-[10px] text-neutral-300">{concept}</span>)}</div>
          <h2 className="mb-3 text-sm font-semibold text-white">Problem</h2><p className="text-sm leading-6 text-neutral-400">{mission.description}</p>
          <div className="mt-7"><h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Examples</h3><div className="space-y-2">{mission.examples.map((example, index) => <div key={`${example.input}-${index}`} className="rounded-xl border border-[#292929] bg-black p-3 font-mono text-xs"><div className="text-neutral-500">input <span className="text-neutral-300">{example.input}</span></div><div className="mt-1 text-neutral-500">output <span className="text-white">{example.output}</span></div></div>)}</div></div>
          <div className="mt-7"><h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Constraints</h3><ul className="space-y-2 text-xs leading-5 text-neutral-500">{mission.constraints.map((constraint) => <li key={constraint} className="flex gap-2"><span className="text-neutral-300">·</span>{constraint}</li>)}</ul></div>
        </aside>
        <section className="min-w-0 rounded-2xl border border-[#292929] bg-[#101010] p-4">
          <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-white" /><span className="font-mono text-[10px] uppercase tracking-[0.15em] text-neutral-500">solution.py</span></div><span className="font-mono text-[10px] text-neutral-600">{editorReady ? "editor ready" : "loading editor"}</span></div>
          <CodeEditor value={code} onChange={setCode} onReady={() => setEditorReady(true)} />
          <p className="mt-3 font-mono text-[10px] leading-5 text-neutral-600">Run checks the public examples; Submit checks the full mission suite through the server-side Python harness.</p>
        </section>
        <aside className="space-y-4">
          <section className="rounded-2xl border border-[#292929] bg-[#101010] p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Test results</h2><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-600">{running ? "running" : "feedback"}</span></div>{requestError && <div role="alert" className="mb-4 rounded-xl border border-[#737373] bg-[#161616] px-3 py-3 text-sm leading-6 text-neutral-200">{requestError}</div>}<TestResults result={result} /></section>
          <section className="rounded-2xl border border-[#292929] bg-[#101010] p-5"><div className="mb-5"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">Mentor channel</p><h2 className="mt-2 text-lg font-semibold text-white">Need a nudge?</h2><p className="mt-1 text-xs leading-5 text-neutral-500">Run your code, then request evidence-based guidance one level at a time.</p></div><MentorPanel hints={mission.hints} dynamicHints={mentorHints} revealedHintCount={revealedHintCount} hintCategory={hintCategory} hintExplanation={hintExplanation} hintError={hintError} hintLoading={hintLoading} canRequestHint={Boolean(result) && !running} onRequestHint={requestHint} /></section>
        </aside>
      </div>
    </main>
  </div>;
}
