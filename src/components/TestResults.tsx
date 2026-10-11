import type { ExecutionResult, ExecutionStatus, TestCaseResult } from "@/types";

const statusLabels: Record<ExecutionStatus, string> = {
  pending: "Pending",
  running: "Running",
  passed: "Passed",
  wrong_answer: "Wrong answer",
  compilation_error: "Syntax error",
  runtime_error: "Runtime error",
  time_limit_exceeded: "Timed out",
  execution_error: "Execution service error",
};

const testStatusLabels: Record<TestCaseResult["status"], string> = {
  pending: "Pending",
  passed: "Passed",
  failed: "Failed",
  compilation_error: "Syntax error",
  runtime_error: "Runtime error",
  time_limit_exceeded: "Timed out",
  execution_error: "Execution error",
};

function statusTone(status: ExecutionStatus | TestCaseResult["status"]): string {
  if (status === "passed") return "border-emerald-900/70 bg-emerald-950/35 text-emerald-200";
  if (status === "wrong_answer" || status === "failed" || status === "time_limit_exceeded") {
    return "border-amber-900/70 bg-amber-950/25 text-amber-100";
  }
  if (status === "compilation_error" || status === "runtime_error" || status === "execution_error") {
    return "border-rose-900/70 bg-rose-950/25 text-rose-100";
  }
  return "border-[#404040] bg-[#181818] text-neutral-300";
}

function OutputDetails({ test }: { test: TestCaseResult }) {
  if (!test.expectedOutput && !test.actualOutput && !test.stdout && !test.stderr && !test.errorMessage) return null;

  return (
    <details className="group mt-2">
      <summary className="w-fit cursor-pointer list-none text-[11px] font-medium text-neutral-500 transition hover:text-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
        <span className="group-open:hidden">Show details</span>
        <span className="hidden group-open:inline">Hide details</span>
      </summary>
      <div className="mt-3 space-y-2 border-t border-[#292929] pt-3 text-[11px] leading-5 text-neutral-400">
        {test.expectedOutput && <div><span className="text-neutral-600">Expected </span><code className="break-all text-neutral-300">{test.expectedOutput}</code></div>}
        {test.actualOutput && <div><span className="text-neutral-600">Returned </span><code className="break-all text-neutral-300">{test.actualOutput}</code></div>}
        {test.stdout && <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[#292929] bg-black p-2">stdout: {test.stdout}</pre>}
        {test.stderr && <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[#292929] bg-black p-2">stderr: {test.stderr}</pre>}
        {test.errorMessage && <p>{test.errorMessage}</p>}
      </div>
    </details>
  );
}

export function TestResults({ result }: { result: ExecutionResult | null }) {
  if (!result) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-[#292929] px-6 text-center">
        <div>
          <p className="text-sm font-medium text-neutral-300">No run yet</p>
          <p className="mt-1 text-xs leading-5 text-neutral-500">Run your code to see the public examples here.</p>
        </div>
      </div>
    );
  }

  const completedAt = new Date(result.completedAt);
  const timeLabel = Number.isNaN(completedAt.getTime())
    ? null
    : completedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const isPassed = result.status === "passed" && result.allPassed;
  const completedMission = isPassed && result.mode === "submit";

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="rounded-xl border border-[#292929] bg-[#0b0b0b] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${statusTone(result.status)}`}>
              {statusLabels[result.status]}
            </span>
            <p className="mt-3 text-sm leading-6 text-neutral-200">{result.summary}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {result.passedTests} of {result.totalTests} tests passed
            </p>
          </div>
          {timeLabel && <time className="shrink-0 font-mono text-[10px] text-neutral-600">{timeLabel}</time>}
        </div>
        {isPassed && result.mode === "run" && (
          <p className="mt-3 border-t border-[#292929] pt-3 text-xs font-medium text-emerald-200" role="status">
            Public examples passed. Submit the mission to verify the full test suite.
          </p>
        )}
        {completedMission && (
          <p className="mt-3 border-t border-[#292929] pt-3 text-xs font-medium text-emerald-200" role="status">
            All required tests passed. This mission is complete.
          </p>
        )}
        {result.persistenceStatus === "saved" && (
          <p className="mt-3 border-t border-[#292929] pt-3 text-xs text-neutral-400" role="status">
            This attempt was saved to your progress.
          </p>
        )}
        {result.persistenceStatus === "not_signed_in" && (
          <p className="mt-3 border-t border-[#292929] pt-3 text-xs text-neutral-400" role="status">
            This attempt was not saved. Sign in to track your progress.
          </p>
        )}
        {result.persistenceStatus === "unavailable" && (
          <p className="mt-3 border-t border-[#292929] pt-3 text-xs text-neutral-400" role="status">
            Progress saving is not configured for this run.
          </p>
        )}
        {result.persistenceStatus === "failed" && (
          <p className="mt-3 border-t border-[#292929] pt-3 text-xs text-amber-200" role="status">
            Execution finished, but this attempt could not be saved. Your progress may not include this run.
          </p>
        )}
        {result.status === "execution_error" && (
          <p className="mt-3 border-t border-[#292929] pt-3 text-xs leading-5 text-rose-200">
            The execution service did not return a usable result. Check your connection or try again later.
          </p>
        )}
      </div>

      <div className="divide-y divide-[#292929] overflow-hidden rounded-xl border border-[#292929]">
        {result.tests.map((test, index) => (
          <div key={`${test.id}-${index}`} className="px-3 py-3 text-xs">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words text-neutral-300">{test.label}</span>
              <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-medium ${statusTone(test.status)}`}>
                {testStatusLabels[test.status]}
                {test.durationMs !== undefined && (
                  <span className="ml-2 font-mono opacity-70">{Math.round(test.durationMs)}ms</span>
                )}
              </span>
            </div>
            <OutputDetails test={test} />
          </div>
        ))}
      </div>
    </div>
  );
}
