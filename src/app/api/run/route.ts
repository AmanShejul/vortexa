import { NextResponse } from "next/server";
import { getMission } from "@/lib/missions";
import { getMissionTestCases, type ServerTestCase } from "@/lib/mission-tests";
import { buildPythonHarness, parseHarnessOutput, type HarnessResult } from "@/lib/python-harness";
import { executePython, Judge0ServiceError, type Judge0ExecutionResult } from "@/lib/judge0";
import { classifyMistake } from "../../../../yash/aiMentor.js";
import { createMentorEvidenceToken, isMentorEvidenceSigningAvailable } from "@/lib/mentor-evidence";
import { getAuthenticatedUser, getBearerTokenFromRequest, isSupabaseConfigured, isSupabasePersistenceConfigured } from "@/lib/supabase";
import { persistMissionAttempt } from "@/lib/learner-persistence";
import { consumeRunRateLimit } from "@/lib/run-rate-limit";
import { createDemoExecutionResult } from "@/lib/demo-execution";
import type { ExecutionMode, ExecutionResult, TestCaseResult } from "@/types";

const MAX_REQUEST_BYTES = 128 * 1024;
const MAX_SOURCE_BYTES = 64 * 1024;
const TOTAL_EXECUTION_TIMEOUT_MS = 30_000;

function errorResponse(
  status: 400 | 404 | 413 | 422 | 429 | 500 | 502 | 503 | 504,
  code: string,
  message: string,
  headers?: HeadersInit,
) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

async function readBoundedRequestBody(request: Request): Promise<{ body?: string; tooLarge?: boolean; invalid?: boolean }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_REQUEST_BYTES) {
    return { tooLarge: true };
  }
  if (!request.body) return { body: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return { tooLarge: true };
      }
      chunks.push(value);
    }
  } catch {
    return { invalid: true };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { body: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { invalid: true };
  }
}

function truncate(value: string | undefined, maxLength = 4_000): string | undefined {
  if (!value) return undefined;
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n[truncated]` : value;
}

function stringifyValue(value: unknown): string | undefined {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? undefined : serialized;
  } catch {
    return undefined;
  }
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length || !leftKeys.every((key, index) => key === rightKeys[index])) return false;
    return leftKeys.every((key) => valuesEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
  }
  return false;
}

function isPublicTest(testCase: ServerTestCase): boolean {
  return testCase.id.startsWith("public-");
}

function formatHarnessFailure(harnessResult: HarnessResult): string {
  const errorType = harnessResult.errorType?.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60);
  if (errorType && harnessResult.errorMessage) {
    return `${errorType}: ${truncate(harnessResult.errorMessage, 500)}`;
  }
  return "Your function raised an error while processing this test.";
}

function evaluateTest(testCase: ServerTestCase, judgeResult: Judge0ExecutionResult): TestCaseResult {
  const publicTest = isPublicTest(testCase);
  const harnessResult = judgeResult.statusId === 3 ? parseHarnessOutput(judgeResult.stdout ?? "") : null;
  const shared = {
    id: testCase.id,
    label: testCase.label,
    durationMs: harnessResult?.durationMs ?? judgeResult.timeMs,
  };

  if (judgeResult.statusId === 5) {
    return { ...shared, status: "time_limit_exceeded", ...(publicTest ? { errorMessage: "Your code exceeded the test execution time limit." } : {}) };
  }
  if (judgeResult.statusId === 6) {
    return { ...shared, status: "compilation_error", ...(publicTest ? { errorMessage: "Python could not compile this submission. Check the syntax in your function." } : {}) };
  }
  if (judgeResult.statusId === 13 || judgeResult.statusId === 14 || judgeResult.statusId < 3 || judgeResult.statusId > 14) {
    return { ...shared, status: "execution_error", ...(publicTest ? { errorMessage: "The execution service did not return a usable result." } : {}) };
  }
  if (judgeResult.statusId !== 3) {
    const status = judgeResult.statusId === 4 ? "failed" : "runtime_error";
    const errorMessage = status === "failed"
      ? "The submitted code did not produce the expected result."
      : "Your code stopped with a runtime error. Check the operations performed by the function.";
    return { ...shared, status, ...(publicTest ? { errorMessage } : {}) };
  }
  if (!harnessResult) {
    return { ...shared, status: "execution_error", ...(publicTest ? { errorMessage: "The execution harness returned an invalid result." } : {}) };
  }
  if (!harnessResult.ok) {
    return { ...shared, status: "runtime_error", ...(publicTest ? { errorMessage: formatHarnessFailure(harnessResult) } : {}) };
  }

  const passed = valuesEqual(harnessResult.value, testCase.expected);
  if (passed) {
    return {
      ...shared,
      status: "passed",
      ...(publicTest
        ? {
            expectedOutput: stringifyValue(testCase.expected),
            actualOutput: stringifyValue(harnessResult.value),
            stdout: truncate(harnessResult.stdout),
          }
        : {}),
    };
  }
  return {
    ...shared,
    status: "failed",
    ...(publicTest
      ? {
          expectedOutput: stringifyValue(testCase.expected),
          actualOutput: stringifyValue(harnessResult.value),
          stdout: truncate(harnessResult.stdout),
          errorMessage: "The returned value did not match the expected result.",
        }
      : {}),
  };
}

function overallStatus(tests: TestCaseResult[]): ExecutionResult["status"] {
  if (tests.every((test) => test.status === "passed")) return "passed";
  if (tests.some((test) => test.status === "time_limit_exceeded")) return "time_limit_exceeded";
  if (tests.some((test) => test.status === "compilation_error")) return "compilation_error";
  if (tests.some((test) => test.status === "runtime_error")) return "runtime_error";
  if (tests.some((test) => test.status === "execution_error")) return "execution_error";
  return "wrong_answer";
}

function createResult(mode: ExecutionMode, tests: TestCaseResult[], totalTests: number, errorMessage?: string): ExecutionResult {
  const passedTests = tests.filter((test) => test.status === "passed").length;
  const failedTests = totalTests - passedTests;
  const allPassed = totalTests > 0 && passedTests === totalTests;
  const status = errorMessage ? "execution_error" : overallStatus(tests);
  return {
    status,
    summary: errorMessage ?? (allPassed ? `All ${totalTests} tests passed.` : `${passedTests} of ${totalTests} tests passed.`),
    isMock: false,
    completedAt: new Date().toISOString(),
    tests,
    totalTests,
    passedTests,
    failedTests,
    allPassed,
    mode,
    executionSource: "live",
    executionScope: mode === "run" ? "public_tests_only" : "full_suite",
    isSimulated: false,
    ...(errorMessage ? { errorMessage } : {}),
  };
}

export async function POST(request: Request) {
  const boundedBody = await readBoundedRequestBody(request);
  if (boundedBody.tooLarge) {
    return errorResponse(413, "request_too_large", "The execution request is too large.");
  }
  if (boundedBody.invalid || boundedBody.body === undefined) {
    return errorResponse(400, "invalid_request", "The request body could not be read.");
  }

  let body: unknown;
  try {
    body = JSON.parse(boundedBody.body);
  } catch {
    return errorResponse(400, "invalid_json", "The request body must be valid JSON.");
  }
  if (!body || typeof body !== "object") {
    return errorResponse(400, "invalid_request", "The request body must be an object.");
  }

  const requestBody = body as Record<string, unknown>;
  const missionId = requestBody.missionId;
  const sourceCode = requestBody.sourceCode;
  const language = requestBody.language;
  const mode = requestBody.mode;
  const executionSource = requestBody.executionSource ?? "demo";
  if (typeof missionId !== "string" || !/^[a-z0-9-]+$/.test(missionId)) {
    return errorResponse(400, "invalid_mission_id", "A valid mission ID is required.");
  }
  if (typeof sourceCode !== "string" || sourceCode.trim().length === 0) {
    return errorResponse(400, "invalid_source_code", "Python source code is required.");
  }
  if (Buffer.byteLength(sourceCode, "utf8") > MAX_SOURCE_BYTES) {
    return errorResponse(413, "source_too_large", "The Python source exceeds the allowed size.");
  }
  if (language !== "python") {
    return errorResponse(400, "unsupported_language", "Only Python submissions are supported.");
  }
  if (mode !== "run" && mode !== "submit") {
    return errorResponse(400, "invalid_mode", "Execution mode must be run or submit.");
  }
  if (executionSource !== "live" && executionSource !== "demo") {
    return errorResponse(400, "invalid_execution_source", "Execution source must be live or demo.");
  }

  const mission = getMission(missionId);
  if (!mission) return errorResponse(404, "unknown_mission", "The requested mission was not found.");

  let testCases: ServerTestCase[];
  try {
    testCases = getMissionTestCases(missionId, mode);
  } catch {
    return errorResponse(500, "missing_test_definition", "This mission is not configured for execution.");
  }

  const authorizationWasProvided = Boolean(getBearerTokenFromRequest(request));
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>> = null;
  let identityVerified = !isSupabaseConfigured() || !authorizationWasProvided;
  if (isSupabaseConfigured() && authorizationWasProvided) {
    try {
      user = await getAuthenticatedUser(request);
      identityVerified = user !== null;
    } catch {
      identityVerified = false;
    }
  } else if (isSupabaseConfigured()) {
    try {
      user = await getAuthenticatedUser(request);
    } catch {
      user = null;
    }
  }
  const rateLimit = consumeRunRateLimit(user
    ? { kind: "learner", userId: user.id }
    : { kind: "anonymous" });
  if (!rateLimit.allowed) {
    return errorResponse(
      429,
      "rate_limited",
      "Too many execution requests. Please wait before trying again.",
      { "Retry-After": String(rateLimit.retryAfterSeconds) },
    );
  }

  if (executionSource === "demo") {
    return NextResponse.json(createDemoExecutionResult(missionId, mode));
  }

  const tests: TestCaseResult[] = [];
  const deadlineAt = Date.now() + TOTAL_EXECUTION_TIMEOUT_MS;
  const executionController = new AbortController();
  const deadlineTimer = setTimeout(() => executionController.abort(), TOTAL_EXECUTION_TIMEOUT_MS);
  try {
    for (const testCase of testCases) {
      if (Date.now() >= deadlineAt) {
        throw new Judge0ServiceError("The execution request exceeded its total time limit.", 504, "execution_deadline");
      }
      const harnessSource = buildPythonHarness(mission, testCase, sourceCode);
      const judgeResult = await executePython(harnessSource, undefined, {
        deadlineAt,
        perTestTimeoutMs: 8_000,
        signal: executionController.signal,
      });
      if (judgeResult.statusId === 13 || judgeResult.statusId === 14) {
        throw new Judge0ServiceError(
          "Code execution service encountered an internal error.",
          502,
          "provider_internal_error",
        );
      }
      const testResult = evaluateTest(testCase, judgeResult);
      if (testResult.status === "execution_error") {
        throw new Judge0ServiceError(
          "Code execution service returned an invalid execution result.",
          502,
          "invalid_response",
        );
      }
      tests.push(testResult);
    }
  } catch (error) {
    if (error instanceof Judge0ServiceError) {
      return errorResponse(error.httpStatus, `judge0_${error.code}`, error.message);
    }
    return errorResponse(500, "execution_failed", "The execution request could not be completed.");
  } finally {
    clearTimeout(deadlineTimer);
  }

  const executionResult = createResult(mode, tests, testCases.length);

  if (executionResult.status !== "execution_error" && identityVerified && isMentorEvidenceSigningAvailable()) {
    executionResult.mentorEvidenceToken = createMentorEvidenceToken({
      missionId,
      sourceCode,
      mode,
      userId: user?.id ?? null,
      status: executionResult.status,
      category: classifyMistake(sourceCode, executionResult),
    });
  }

  executionResult.persistenceStatus = "unavailable";
  if (isSupabasePersistenceConfigured()) {
    try {
      if (user) {
        const attempt = await persistMissionAttempt({
          learnerId: user.id,
          missionId,
          mode,
          executionStatus: executionResult.status,
          passedTests: executionResult.passedTests,
          totalTests: executionResult.totalTests,
          allPassed: executionResult.allPassed,
          mistakeCategory: executionResult.allPassed ? undefined : executionResult.status === "wrong_answer" ? "INCORRECT_LOGIC" : undefined,
        });

        if (!attempt.skipped) {
          executionResult.attemptId = attempt.id;
          executionResult.persistenceStatus = "saved";
        } else {
          executionResult.persistenceStatus = "unavailable";
        }
      } else {
        executionResult.persistenceStatus = "not_signed_in";
      }
    } catch {
      executionResult.persistenceStatus = "failed";
    }
  }

  return NextResponse.json(executionResult);
}
