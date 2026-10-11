"use client";

import Link from "next/link";
import { useState } from "react";
import { CodeEditor } from "@/components/CodeEditor";
import { MentorPanel } from "@/components/MentorPanel";
import { TestResults } from "@/components/TestResults";
import { executeMission } from "@/lib/execution-client";
import { getBrowserAccessToken } from "@/lib/supabase";
import type { LocalPythonPhase } from "@/lib/local-python";
import type { ExecutionMode, ExecutionResult, ExecutionSource, HintSet, MentorResponse, Mission } from "@/types";

function clearMentorState(
  setMentorHints: (hints: Partial<HintSet>) => void,
  setRevealedHintCount: (count: number) => void,
  setHintCategory: (category: string | undefined) => void,
  setHintExplanation: (explanation: string | undefined) => void,
  setHintError: (error: string | null) => void,
) {
  setMentorHints({});
  setRevealedHintCount(0);
  setHintCategory(undefined);
  setHintExplanation(undefined);
  setHintError(null);
}

export function ArenaWorkspace({ mission }: { mission: Mission }) {
  const [code, setCode] = useState(mission.starterCode);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [executionSource, setExecutionSource] = useState<ExecutionSource>("local");
  const [localPythonPhase, setLocalPythonPhase] = useState<LocalPythonPhase>("loading");
  const [resultSource, setResultSource] = useState<string | null>(null);
  const [mentorEvidenceToken, setMentorEvidenceToken] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [mentorHints, setMentorHints] = useState<Partial<HintSet>>({});
  const [revealedHintCount, setRevealedHintCount] = useState(0);
  const [hintCategory, setHintCategory] = useState<string | undefined>();
  const [hintExplanation, setHintExplanation] = useState<string | undefined>();
  const [hintError, setHintError] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  const resultIsCurrent = Boolean(result && resultSource === code);
  const canRequestHint = Boolean(
    resultIsCurrent
      && result
      && result.status !== "execution_error"
      && (result.isSimulated
        || result.executionSource === "local"
        || (mentorEvidenceToken && !result.isMock)),
  );

  function switchExecutionSource(nextSource: ExecutionSource) {
    if (running || hintLoading || nextSource === executionSource) return;
    setExecutionSource(nextSource);
    setResult(null);
    setResultSource(null);
    setMentorEvidenceToken(null);
    setRequestError(null);
    clearMentorState(setMentorHints, setRevealedHintCount, setHintCategory, setHintExplanation, setHintError);
  }

  async function run(mode: ExecutionMode) {
    if (running) return;
    const submittedCode = code;
    setRunning(true);
    setResult(null);
    setResultSource(null);
    setMentorEvidenceToken(null);
    setRequestError(null);
    clearMentorState(setMentorHints, setRevealedHintCount, setHintCategory, setHintExplanation, setHintError);
    try {
      const executionResult = await executeMission(
        mission.id,
        submittedCode,
        mode,
        executionSource,
        executionSource === "local" ? setLocalPythonPhase : undefined,
      );
      setResult(executionResult);
      setResultSource(submittedCode);
      setMentorEvidenceToken(executionResult.mentorEvidenceToken ?? null);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Execution could not be completed. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  function resetCode() {
    if (running || hintLoading) return;
    setCode(mission.starterCode);
    setResult(null);
    setResultSource(null);
    setMentorEvidenceToken(null);
    setRequestError(null);
    clearMentorState(setMentorHints, setRevealedHintCount, setHintCategory, setHintExplanation, setHintError);
  }

  async function requestHint(level: number) {
    if (hintLoading || !canRequestHint || !result) return;

    setHintLoading(true);
    setHintError(null);
    try {
      const accessToken = await getBrowserAccessToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const response = await fetch("/api/hint", {
        method: "POST",
        headers,
        body: JSON.stringify({
          missionId: mission.id,
          mode: result.mode,
          hintLevel: level,
          ...(result.isSimulated || result.executionSource === "local"
            ? { general: true }
            : { sourceCode: code, evidenceToken: mentorEvidenceToken }),
        }),
      });
      const payload = await response.json().catch(() => null) as (MentorResponse & { error?: string }) | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Mentor guidance could not be loaded. Try again.");
      }
      if (!payload || typeof payload.hint !== "string" || typeof payload.category !== "string") {
        throw new Error("The mentor returned an invalid response. Please try again.");
      }
      const trustedServerEvidence = result.executionSource === "live" && !result.isSimulated;
      if (trustedServerEvidence && level < 3 && typeof payload.nextEvidenceToken !== "string") {
        throw new Error("The mentor did not return the next hint reference. Run your code again.");
      }

      const keys: Array<keyof HintSet> = ["nudge", "approach", "detailed"];
      setMentorHints((current) => ({ ...current, [keys[level - 1]]: payload.hint }));
      setRevealedHintCount((current) => Math.max(current, level));
      setHintCategory(payload.category);
      setHintExplanation(payload.explanation);
      if (trustedServerEvidence) setMentorEvidenceToken(payload.nextEvidenceToken ?? null);
    } catch (error) {
      setHintError(error instanceof Error ? error.message : "Mentor guidance could not be loaded. Try again.");
    } finally {
      setHintLoading(false);
    }
  }

  const statusMessage = running
    ? executionSource === "demo"
      ? "Showing labelled demo feedback…"
      : executionSource === "local"
        ? localPythonPhase === "loading" ? "Loading local Python runtime…" : "Running Python locally…"
        : "Judge0 is running your Python solution…"
    : requestError
      ? "Execution could not be completed."
      : result?.isSimulated
        ? "Demo sample shown — your Python code was not executed."
        : result?.status === "passed" && result.allPassed
          ? result.executionSource === "local"
            ? "Local public examples passed. Hidden tests were not run."
            : result.mode === "submit"
            ? "All required mission tests passed."
            : "Public examples passed. Submit to check the complete mission."
        : result
          ? `${result.passedTests} of ${result.totalTests} tests passed.`
          : "Ready when you are. Run the public examples, or submit against the full test suite.";

  return (
    <div className="min-h-screen bg-[#080808] text-neutral-200">
      <header className="sticky top-0 z-40 border-b border-[#292929] bg-[#080808]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-14 w-[min(1480px,calc(100%-24px))] items-center justify-between gap-3 sm:min-h-16 sm:w-[min(1480px,calc(100%-40px))]">
          <Link href="/missions" className="inline-flex min-h-10 items-center rounded-lg pr-2 text-sm font-medium text-neutral-400 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <span aria-hidden="true" className="mr-2">←</span> Missions
          </Link>
          <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500 sm:flex">
            <span className="size-1.5 rounded-full bg-neutral-300" aria-hidden="true" />
            Python · {executionSource === "local" ? "Local" : executionSource === "demo" ? "Demo" : "Judge0"}
          </div>
          <span className="max-w-[45%] truncate text-right text-xs text-neutral-500 sm:max-w-none">
            {mission.category} <span className="text-neutral-700">/</span> {mission.difficulty}
          </span>
        </div>
      </header>

      <main className="mx-auto w-[min(1480px,calc(100%-24px))] py-5 sm:w-[min(1480px,calc(100%-40px))] sm:py-8">
        <div className={`mb-4 flex flex-col gap-3 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${executionSource === "demo" ? "border-amber-800/70 bg-amber-950/20" : "border-[#292929] bg-[#0d0d0d]"}`} role="status">
          <div>
            <p className={`font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${executionSource === "demo" ? "text-amber-200" : "text-neutral-300"}`}>
              {executionSource === "demo"
                ? "DEMO MODE — simulated feedback"
                : executionSource === "local"
                  ? "LOCAL PYTHON — browser execution"
                  : "LIVE MODE — Judge0 execution"}
            </p>
            <p className="mt-1 text-xs leading-5 text-neutral-400">
              {executionSource === "demo"
                ? "Sample feedback is not executed against your code and cannot complete a mission."
                : executionSource === "local"
                  ? "Your code runs in a browser worker. Only public examples are checked; submit does not run hidden tests or save trusted progress."
                  : "Your code will be sent to the configured Judge0 provider."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["local", "Local Python"],
              ["live", "Live Judge0"],
              ["demo", "Demo Mode"],
            ] as const).map(([source, label]) => (
              <button
                key={source}
                type="button"
                onClick={() => switchExecutionSource(source)}
                disabled={running || hintLoading || source === executionSource}
                aria-pressed={source === executionSource}
                className={`min-h-10 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default ${
                  source === executionSource
                    ? "border-white bg-white text-black"
                    : "border-[#525252] text-white hover:border-[#737373] hover:bg-[#202020]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-5 flex flex-col gap-5 border-b border-[#292929] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">Mission workspace</p>
            <h1 className="break-words text-3xl font-semibold leading-tight tracking-[-0.045em] text-white sm:text-4xl">{mission.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">{mission.shortDescription}</p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-wrap sm:justify-start lg:justify-end">
            <button
              type="button"
              onClick={() => run("run")}
              disabled={running}
              aria-busy={running}
              className="min-h-11 rounded-xl border border-[#525252] bg-[#171717] px-3 text-xs font-semibold text-white transition hover:border-[#737373] hover:bg-[#202020] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:border-[#292929] disabled:text-neutral-500 sm:min-w-28 sm:px-4"
            >
              {running ? "Running…" : "Run code"}
            </button>
            <button
              type="button"
              onClick={() => run("submit")}
              disabled={running}
              aria-busy={running}
              className="min-h-11 rounded-xl bg-white px-3 text-xs font-bold text-black transition hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:bg-[#292929] disabled:text-neutral-500 sm:min-w-32 sm:px-4"
            >
              {running ? "Checking…" : "Submit mission"}
            </button>
            <button
              type="button"
              onClick={resetCode}
              disabled={running || hintLoading}
              className="min-h-11 rounded-xl border border-[#292929] px-3 text-xs font-medium text-neutral-400 transition hover:border-[#525252] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:text-neutral-700 sm:px-4"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mb-4 flex min-h-10 items-center gap-2 rounded-xl border border-[#292929] bg-[#0d0d0d] px-3 py-2" role="status" aria-live="polite">
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${
              running ? "animate-pulse bg-amber-300" : result?.status === "passed" && result.allPassed ? "bg-emerald-300" : requestError ? "bg-rose-300" : "bg-neutral-500"
            }`}
          />
          <p className={`text-xs leading-5 ${requestError ? "text-rose-200" : result?.status === "passed" && result.allPassed ? "text-emerald-200" : "text-neutral-400"}`}>
            {requestError ?? statusMessage}
          </p>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(230px,0.72fr)_minmax(0,1.28fr)] xl:grid-cols-[minmax(250px,0.72fr)_minmax(0,1.55fr)_minmax(280px,0.83fr)]">
          <aside className="min-w-0 rounded-2xl border border-[#292929] bg-[#101010] p-4 sm:p-5">
            <div className="mb-5 flex flex-wrap gap-2">
              {mission.concepts.map((concept) => (
                <span key={concept} className="rounded-lg border border-[#353535] bg-[#171717] px-2.5 py-1.5 text-[11px] text-neutral-300">{concept}</span>
              ))}
            </div>
            <h2 className="text-sm font-semibold text-white">Problem</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">{mission.description}</p>

            <div className="mt-6">
              <h3 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Examples</h3>
              <div className="space-y-2">
                {mission.examples.map((example, index) => (
                  <div key={`${example.input}-${index}`} className="overflow-hidden rounded-xl border border-[#292929] bg-[#0a0a0a] p-3 font-mono text-[11px] leading-5">
                    <div className="break-words text-neutral-500">Input <span className="text-neutral-300">{example.input}</span></div>
                    <div className="mt-1 break-words text-neutral-500">Output <span className="text-white">{example.output}</span></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-[#292929] pt-5">
              <h3 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Constraints</h3>
              <ul className="space-y-2 text-xs leading-5 text-neutral-400">
                {mission.constraints.map((constraint) => (
                  <li key={constraint} className="flex gap-2"><span aria-hidden="true" className="text-neutral-600">·</span><span>{constraint}</span></li>
                ))}
              </ul>
            </div>
          </aside>

          <section className="min-w-0 rounded-2xl border border-[#292929] bg-[#101010] p-3 sm:p-4" aria-label="Code editor">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-neutral-400" aria-hidden="true" />
                <span className="font-mono text-[11px] text-neutral-300">solution.py</span>
                <span className="rounded-md border border-[#292929] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-neutral-500">Python</span>
              </div>
              <span className="font-mono text-[10px] text-neutral-500" role="status">
                {running ? "Executing…" : editorReady ? "Editor ready" : "Loading editor"}
              </span>
            </div>
            <CodeEditor value={code} onChange={setCode} onReady={() => setEditorReady(true)} readOnly={running} />
            <p className="mt-3 text-[11px] leading-5 text-neutral-500">
              {executionSource === "local"
                ? "Run and Submit both execute locally against public examples only; hidden tests are never sent to this browser."
                : executionSource === "demo"
                  ? "Demo mode does not execute code or verify tests."
                  : "Run checks the public examples. Submit checks the full mission suite."}
              {running && " Editing is paused until this run finishes."}
            </p>
          </section>

          <aside className="grid min-w-0 gap-4 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
            <section className="min-w-0 rounded-2xl border border-[#292929] bg-[#101010] p-4 sm:p-5" aria-labelledby="test-results-title">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-neutral-500">Execution feedback</p>
                  <h2 id="test-results-title" className="mt-1 text-base font-semibold text-white">Test results</h2>
                </div>
                {result && (
                  <span className="rounded-md border border-[#353535] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-400">
                    {result.mode}
                  </span>
                )}
              </div>
              {requestError && (
                <div role="alert" className="mb-4 rounded-xl border border-rose-900/70 bg-rose-950/20 px-3 py-3 text-xs leading-5 text-rose-100">
                  {requestError}
                </div>
              )}
              {result && !resultIsCurrent && (
                <div className="mb-4 rounded-xl border border-amber-900/70 bg-amber-950/20 px-3 py-3 text-xs leading-5 text-amber-100" role="status">
                  The code has changed since this result. Run it again to refresh feedback and request relevant hints.
                </div>
              )}
              <TestResults result={result} />
            </section>

            <section className="min-w-0 rounded-2xl border border-[#292929] bg-[#101010] p-4 sm:p-5" aria-labelledby="mentor-title">
              <div className="mb-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-neutral-500">Mentor guidance</p>
                <h2 id="mentor-title" className="mt-1 text-base font-semibold text-white">Work through the next step</h2>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Deterministic guidance; only Live Judge0 results provide server-verified execution evidence.
                </p>
              </div>
              <MentorPanel
                dynamicHints={resultIsCurrent ? mentorHints : {}}
                revealedHintCount={resultIsCurrent ? revealedHintCount : 0}
                hintCategory={resultIsCurrent ? hintCategory : undefined}
                hintExplanation={resultIsCurrent ? hintExplanation : undefined}
                hintError={resultIsCurrent ? hintError : null}
                hintLoading={hintLoading}
                canRequestHint={canRequestHint}
                executionMode={resultIsCurrent ? result?.mode : undefined}
                executionStatus={resultIsCurrent ? result?.status : undefined}
                executionSource={resultIsCurrent ? result?.executionSource : undefined}
                onRequestHint={requestHint}
              />
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
