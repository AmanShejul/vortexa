import { executeInLocalPython, type LocalPythonPhase } from "@/lib/local-python";
import type { ExecutionMode, ExecutionResult, ExecutionSource } from "@/types";
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
    return "Live Python execution is unavailable because Judge0 is not configured. Switch to Demo mode for labelled sample feedback, or add JUDGE0_API_URL in .env.local and restart the app.";
  }
  if (code === "judge0_configuration_invalid") {
    return "The Judge0 URL or Python language ID is invalid. Check JUDGE0_API_URL and JUDGE0_PYTHON_LANGUAGE_ID in .env.local.";
  }
  if (code === "judge0_authentication_failed") {
    return "Judge0 rejected its configured credentials. Check JUDGE0_API_KEY and the auth header settings in .env.local.";
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
    return "Live Python execution is unavailable right now. Switch to Demo mode for labelled sample feedback, or try again after the execution service is restored.";
  }
  if (status === 504) {
    return "The execution service could not finish this request in time. Please try again.";
  }

  return "The execution request could not be completed. Please try again.";
}

function isPublicTestCase(value: unknown): value is PublicPythonTestCase {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const testCase = value as Record<string, unknown>;
  return typeof testCase.id === "string"
    && testCase.id.startsWith("public-")
    && typeof testCase.label === "string"
    && Array.isArray(testCase.args)
    && "expected" in testCase;
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
      : "Public mission examples could not be loaded. Retry or switch to Demo Mode.");
  }

  const suite: unknown = await response.json().catch(() => null);
  if (
    !suite
    || typeof suite !== "object"
    || !("functionName" in suite)
    || typeof suite.functionName !== "string"
    || !("tests" in suite)
    || !Array.isArray(suite.tests)
    || suite.tests.length === 0
    || !suite.tests.every(isPublicTestCase)
  ) {
    throw new Error("The server returned an invalid public test suite. Retry or switch to Demo Mode.");
  }

  const execution = await executeInLocalPython(
    sourceCode,
    suite.functionName,
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
    isMock: false,
    executionSource: "local",
    executionScope: "public_tests_only",
    isSimulated: false,
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
): Promise<ExecutionResult> {
  if (executionSource === "local") {
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
      body: JSON.stringify({ missionId, sourceCode, language: "python", mode, executionSource }),
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
      || payload.executionSource !== executionSource
      || !("isSimulated" in payload)
      || payload.isSimulated !== (executionSource === "demo")
      || !("executionScope" in payload)
      || (payload.executionScope !== "public_tests_only"
        && payload.executionScope !== "full_suite"
        && payload.executionScope !== "simulation")
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
