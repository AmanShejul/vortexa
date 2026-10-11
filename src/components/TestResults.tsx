import type { ExecutionResult, ExecutionStatus, TestCaseResult } from "@/types";

const statusLabels: Record<ExecutionStatus, string> = { pending: "Pending", running: "Running", passed: "Passed", wrong_answer: "Wrong answer", compilation_error: "Compilation error", runtime_error: "Runtime error", time_limit_exceeded: "Time limit exceeded", execution_error: "Execution error" };
const testStatusLabels: Record<TestCaseResult["status"], string> = { pending: "pending", passed: "passed", failed: "failed", compilation_error: "compile error", runtime_error: "runtime error", time_limit_exceeded: "timed out", execution_error: "execution error" };
const statusStyles: Record<ExecutionStatus, string> = { pending: "text-neutral-400 bg-[#1f1f1f]", running: "text-white bg-[#292929]", passed: "text-white bg-[#292929]", wrong_answer: "text-neutral-200 bg-[#292929]", compilation_error: "text-neutral-200 bg-[#292929]", runtime_error: "text-neutral-200 bg-[#292929]", time_limit_exceeded: "text-neutral-200 bg-[#292929]", execution_error: "text-neutral-200 bg-[#292929]" };

function OutputDetails({ test }: { test: TestCaseResult }) {
  if (!test.expectedOutput && !test.actualOutput && !test.stdout && !test.stderr && !test.errorMessage) return null;
  return <div className="mt-3 space-y-2 border-t border-[#292929] pt-3 text-[11px] leading-5 text-neutral-500">
    {test.expectedOutput && <div><span className="text-neutral-600">expected </span><code className="break-all text-neutral-300">{test.expectedOutput}</code></div>}
    {test.actualOutput && <div><span className="text-neutral-600">returned </span><code className="break-all text-neutral-300">{test.actualOutput}</code></div>}
    {test.stdout && <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black p-2 text-neutral-400">stdout: {test.stdout}</pre>}
    {test.stderr && <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black p-2 text-neutral-400">stderr: {test.stderr}</pre>}
    {test.errorMessage && <p className="text-neutral-400">{test.errorMessage}</p>}
  </div>;
}

export function TestResults({ result }: { result: ExecutionResult | null }) {
  if (!result) return <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-[#292929] px-6 text-center text-sm text-neutral-500">Run your code to see execution feedback here.</div>;
  return <div className="space-y-4">
    <div className="flex items-start justify-between gap-3"><div><div className="mb-2 flex flex-wrap items-center gap-2"><span className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusStyles[result.status]}`}>{statusLabels[result.status]}</span><span className="rounded-md border border-[#404040] px-2 py-1 text-[10px] text-neutral-400">REAL EXECUTION</span></div><p className="text-sm text-neutral-300">{result.summary}</p><p className="mt-1 text-xs text-neutral-600">{result.passedTests}/{result.totalTests} tests passed</p></div><span className="font-mono text-[10px] text-neutral-600">{new Date(result.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
    <div className="divide-y divide-[#292929] rounded-xl border border-[#292929]">{result.tests.map((test) => <div key={test.id} className="px-3 py-3 text-xs"><div className="flex items-center justify-between gap-3"><span className="text-neutral-400">{test.label}</span><span className="text-neutral-200">{testStatusLabels[test.status]}{test.durationMs !== undefined && <span className="ml-2 font-mono text-[10px] text-neutral-600">{Math.round(test.durationMs)}ms</span>}</span></div><OutputDetails test={test} /></div>)}</div>
  </div>;
}
