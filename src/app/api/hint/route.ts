import { NextResponse } from "next/server";
import { processSubmissionAI } from "../../../../yash/aiMentor.js";
import { getMission } from "@/lib/missions";
import { getAttemptForUser } from "@/lib/learner-persistence";
import { getAuthenticatedUser, isSupabaseConfigured } from "@/lib/supabase";
import type { ExecutionResult } from "@/types";

const MAX_BODY_BYTES = 128 * 1024;
const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_TESTS = 20;
const EXECUTION_STATUSES = new Set([
  "pending",
  "running",
  "passed",
  "wrong_answer",
  "compilation_error",
  "runtime_error",
  "time_limit_exceeded",
  "execution_error"
]);
const TEST_STATUSES = new Set([
  "passed",
  "failed",
  "compilation_error",
  "runtime_error",
  "time_limit_exceeded",
  "execution_error",
  "pending"
]);

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExecutionResult(value: unknown): value is ExecutionResult {
  if (!isRecord(value)) return false;
  if (value.isMock !== false) return false;
  if (typeof value.status !== "string" || !EXECUTION_STATUSES.has(value.status)) return false;
  if (value.status === "pending" || value.status === "running") return false;
  if (!Array.isArray(value.tests) || value.tests.length < 1 || value.tests.length > MAX_TESTS) return false;
  if (typeof value.allPassed !== "boolean") return false;
  if (typeof value.totalTests !== "number" || value.totalTests !== value.tests.length) return false;
  if (typeof value.passedTests !== "number" || typeof value.failedTests !== "number") return false;
  if (value.mode !== "run" && value.mode !== "submit") return false;

  const validTests = value.tests.every((test) => {
    if (!isRecord(test)) return false;
    return typeof test.id === "string"
      && typeof test.label === "string"
      && typeof test.status === "string"
      && TEST_STATUSES.has(test.status)
      && (test.durationMs === undefined || typeof test.durationMs === "number");
  });
  if (!validTests) return false;

  const passedTests = value.tests.filter((test) => isRecord(test) && test.status === "passed").length;
  const failedTests = value.tests.length - passedTests;
  return value.passedTests === passedTests
    && value.failedTests === failedTests
    && value.allPassed === (passedTests === value.tests.length)
    && (value.allPassed ? value.status === "passed" : value.status !== "passed");
}

function sanitizeExecutionResult(result: ExecutionResult): ExecutionResult {
  return {
    ...result,
    tests: result.tests.map((test) => {
      const safeTest = {
        id: test.id.slice(0, 80),
        label: test.label.slice(0, 200),
        status: test.status,
        ...(typeof test.durationMs === "number" ? { durationMs: test.durationMs } : {})
      };

      if (!test.id.startsWith("public-")) return safeTest;

      return {
        ...safeTest,
        ...(typeof test.expectedOutput === "string" ? { expectedOutput: test.expectedOutput.slice(0, 4000) } : {}),
        ...(typeof test.actualOutput === "string" ? { actualOutput: test.actualOutput.slice(0, 4000) } : {}),
        ...(typeof test.stdout === "string" ? { stdout: test.stdout.slice(0, 4000) } : {}),
        ...(typeof test.stderr === "string" ? { stderr: test.stderr.slice(0, 4000) } : {}),
        ...(typeof test.errorMessage === "string" ? { errorMessage: test.errorMessage.slice(0, 4000) } : {})
      };
    })
  };
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (byteLength(rawBody) > MAX_BODY_BYTES) {
      return errorResponse("Request is too large.", 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return errorResponse("Request body must be valid JSON.", 400);
    }

    if (!isRecord(body)) return errorResponse("Request body must be an object.", 400);

    const missionId = body.missionId;
    const sourceCode = body.sourceCode;
    const hintLevel = body.hintLevel;
    const executionResult = body.executionResult;
    const attemptId = typeof body.attemptId === "string" ? body.attemptId : undefined;

    if (typeof missionId !== "string" || !/^[a-z0-9-]{1,80}$/.test(missionId)) {
      return errorResponse("A valid mission ID is required.", 400);
    }

    const mission = getMission(missionId);
    if (!mission) return errorResponse("Unknown mission.", 404);

    if (typeof sourceCode !== "string" || sourceCode.trim().length === 0) {
      return errorResponse("Python source code is required.", 400);
    }
    if (byteLength(sourceCode) > MAX_SOURCE_BYTES) {
      return errorResponse("Source code is too large.", 413);
    }

    if (hintLevel !== undefined && (typeof hintLevel !== "number" || !Number.isInteger(hintLevel) || hintLevel < 1 || hintLevel > 3)) {
      return errorResponse("Hint level must be an integer from 1 to 3.", 400);
    }

    if (attemptId !== undefined && typeof attemptId !== "string") {
      return errorResponse("Attempt ID must be a string when provided.", 400);
    }

    if (!isExecutionResult(executionResult)) {
      return errorResponse("Run the code successfully before requesting a mentor hint.", 400);
    }

    if (isSupabaseConfigured()) {
      const user = await getAuthenticatedUser(request);
      if (attemptId && !user) {
        return errorResponse("Authentication is required to use a persisted attempt.", 401);
      }
      if (user && attemptId) {
        const trustedAttempt = await getAttemptForUser(user.id, missionId, attemptId);
        if (!trustedAttempt) {
          return errorResponse("The attempt is not associated with this learner.", 403);
        }
      }
    }

    const safeResult = sanitizeExecutionResult(executionResult);
    const mentorResponse = processSubmissionAI(sourceCode, safeResult, mission, typeof hintLevel === "number" ? hintLevel : 1);

    return NextResponse.json(mentorResponse, { status: 200 });
  } catch {
    return errorResponse("The mentor service could not process this request.", 500);
  }
}
