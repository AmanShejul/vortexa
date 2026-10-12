import { executeInLocalPython, type LocalPythonPhase } from "@/lib/local-python";
import type { ExecutionMode, ExecutionResult, ExecutionSource, MissionExecutionContract } from "@/types";
import type { PublicPythonTestCase } from "@/lib/pyodide-runner";
import { getBrowserAccessToken } from "@/lib/supabase";

const CLIENT_TIMEOUT_MS = 35_000;
const MAX_SOURCE_BYTES = 64 * 1024;

interface ErrorResponse {
  error?: string | { code?: string; message?: string };
}

export function getSafeExecutionError(status: number, payload: unknown): string {
  const error = payload && typeof payload === "object" && "error" in payload
    ? (payload as ErrorResponse).error
    : undefined;
  const code = typeof error === "object" && error !== null ? error.code : undefined;

  if (code === "judge0_configuration_missing") {
    return "Live Judge0 execution is unavailable because Judge0 is not configured. Local Python remains available in the browser, or add JUDGE0_API_URL in .env.local and restart the app.";
  }
  if (code === "judge0_configuration_invalid") {
    return "The Judge0 URL or Python language ID is invalid. Check JUDGE0_API_URL and JUDGE0_PYTHON_LANGUAGE_ID in .env.local.";
  }
  if (code === "judge0_authentication_failed") {
    return "Judge0 rejected its configured credentials. Check JUDGE0_API_KEY and the auth header settings in .env.local.";
  }
  if (code === "judge0_provider_rate_limited") {
    return "Judge0 rate limits or daily quotas were reached. Wait and try again, or use a different/self-hosted Judge0 instance.";
  }
  if (code === "judge0_provider_overloaded") {
    return "Judge0 is queueing too many submissions right now. Wait a moment and try again; Local Python remains available.";
  }
  if (code === "judge0_provider_unavailable") {
    return "Live Judge0 execution is unavailable because the Next.js server could not reach Judge0. Check server-side HTTPS/DNS access and restart Next.js after changing .env.local. Local Python remains available.";
  }
  if (code === "judge0_provider_timeout" || code === "judge0_poll_timeout") {
    return "Judge0 took too long to respond. Please try again in a moment.";
  }
  if (code === "judge0_execution_deadline") {
    return "The execution request exceeded its total time limit. Please try again.";
  }
  if (code === "judge0_provider_internal_error" || code === "judge0_invalid_response") {
    return "The execution service returned an unusable result. No attempt was recorded; please try again.";
  }
  if (code === "rate_limited") {
    return "Too many execution requests. Please wait before trying again.";
  }
  if (code === "judge0_request_rejected") {
    return "The execution service rejected this request. Please check the submission and try again.";
  }

  if (status === 502 || status === 503) {
    return "Live Judge0 execution is unavailable right now. Use Local Python or try again after the execution service is restored.";
  }
  if (status === 504) {
    return "The execution service could not finish this request in time. Please try again.";
  }

  return "The execution request could not be completed. Please try again.";
}

function isPublicTestCase(value: unknown): value is PublicPythonTestCase {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const testCase = value as Record<string, unknown>;
  if (typeof testCase.id !== "string" || !testCase.id.startsWith("public-") || typeof testCase.label !== "string") {
    return false;
  }
  if (Array.isArray(testCase.args)) return "expected" in testCase;
  return typeof testCase.stdin === "string" && typeof testCase.expectedStdout === "string";
}

function isMissionExecutionContract(value: unknown): value is MissionExecutionContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const execution = value as Record<string, unknown>;
  if (execution.kind === "stdin_stdout") return true;
  if (execution.kind !== "function") return false;
  return typeof execution.functionName === "string"
    && Array.isArray(execution.parameters)
    && execution.parameters.every((parameter) =>
      Boolean(parameter)
      && typeof parameter === "object"
      && typeof (parameter as Record<string, unknown>).name === "string"
      && typeof (parameter as Record<string, unknown>).type === "string")
    && typeof execution.returnType === "string";
}

async function executeLocalMission(
  missionId: string,
  sourceCode: string,
  mode: ExecutionMode,
  onLocalStatus?: (phase: LocalPythonPhase) => void,
): Promise<ExecutionResult> {
  if (!sourceCode.trim()) throw new Error("Enter Python code before running this mission.");
  if (new TextEncoder().encode(sourceCode).byteLength > MAX_SOURCE_BYTES) {
    throw new Error("The Python source exceeds the 64 KiB local execution limit.");
  }

  let response: Response;
  try {
    response = await fetch(`/api/missions/tests?missionId=${encodeURIComponent(missionId)}`, {
      cache: "no-store",
    });
  } catch {
    throw new Error("Public mission examples could not be loaded. Check your connection and retry.");
  }
  if (!response.ok) {
    throw new Error(response.status === 404
      ? "This mission's public examples could not be found."
      : "Public mission examples could not be loaded. Retry or use Live Judge0 if it is configured.");
  }

  const suite: unknown = await response.json().catch(() => null);
  if (
    !suite
    || typeof suite !== "object"
    || !("execution" in suite)
    || !isMissionExecutionContract(suite.execution)
    || !("tests" in suite)
    || !Array.isArray(suite.tests)
    || suite.tests.length === 0
    || !suite.tests.every(isPublicTestCase)
  ) {
    throw new Error("The server returned an invalid public test suite. Retry or use Live Judge0 if it is configured.");
  }

  const execution = await executeInLocalPython(
    sourceCode,
    suite.execution,
    suite.tests,
    onLocalStatus,
  );
  const status: ExecutionResult["status"] = execution.allPassed
    ? "passed"
    : execution.tests.some((test) => test.status === "compilation_error")
      ? "compilation_error"
      : execution.tests.some((test) => test.status === "runtime_error")
        ? "runtime_error"
        : "wrong_answer";
  const summary = `Local execution — public tests only. ${execution.passedTests} of ${execution.tests.length} public tests passed; hidden tests were not run.`;

  return {
    status,
    summary,
    executionSource: "local",
    executionScope: "public_tests_only",
    completedAt: new Date().toISOString(),
    tests: execution.tests,
    totalTests: execution.tests.length,
    passedTests: execution.passedTests,
    failedTests: execution.failedTests,
    allPassed: execution.allPassed,
    mode,
  };
}

export async function executeMission(
  missionId: string,
  sourceCode: string,
  mode: ExecutionMode,
  executionSource: ExecutionSource = "local",
  onLocalStatus?: (phase: LocalPythonPhase) => void,
  submissionId?: string,
): Promise<ExecutionResult> {
  // Local Python is intentionally kept for fast public-example runs. A
  // submission must always use the trusted server path when it exists so
  // public examples cannot be mistaken for a completed mission.
  const resolvedExecutionSource: ExecutionSource = mode === "submit" ? "live" : executionSource;

  if (resolvedExecutionSource === "local") {
    return executeLocalMission(missionId, sourceCode, mode, onLocalStatus);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  try {
    const accessToken = await getBrowserAccessToken();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const response = await fetch("/api/run", {
      method: "POST",
      headers,
      body: JSON.stringify({ missionId, sourceCode, language: "python", mode, executionSource: resolvedExecutionSource, submissionId }),
      signal: controller.signal,
    });

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(getSafeExecutionError(response.status, payload));
    }
    if (
      !payload
      || typeof payload !== "object"
      || !("status" in payload)
      || !("executionSource" in payload)
      || payload.executionSource !== resolvedExecutionSource
      || !("executionScope" in payload)
      || (payload.executionScope !== "public_tests_only"
        && payload.executionScope !== "full_suite")
    ) {
      throw new Error("The execution service returned an invalid response.");
    }
    return payload as ExecutionResult;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The execution request timed out. Please try again.");
    }
    throw error instanceof Error ? error : new Error("The execution request failed.");
  } finally {
    window.clearTimeout(timeout);
  }
}
