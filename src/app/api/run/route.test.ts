import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executePython: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getBearerTokenFromRequest: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  isSupabasePersistenceConfigured: vi.fn(),
  persistMissionAttempt: vi.fn(),
  consumeRunRateLimit: vi.fn(),
}));

vi.mock("@/lib/judge0", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/judge0")>();
  return { ...actual, executePython: mocks.executePython };
});

vi.mock("@/lib/supabase", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getBearerTokenFromRequest: mocks.getBearerTokenFromRequest,
  isSupabaseConfigured: mocks.isSupabaseConfigured,
  isSupabasePersistenceConfigured: mocks.isSupabasePersistenceConfigured,
}));

vi.mock("@/lib/learner-persistence", () => ({
  persistMissionAttempt: mocks.persistMissionAttempt,
}));

vi.mock("@/lib/run-rate-limit", () => ({
  consumeRunRateLimit: mocks.consumeRunRateLimit,
}));

import { POST } from "@/app/api/run/route";
import { Judge0ServiceError } from "@/lib/judge0";
import { verifyMentorEvidenceToken } from "@/lib/mentor-evidence";
import { HARNESS_MARKER } from "@/lib/python-harness";

function makeRequest(mode: "run" | "submit" = "submit") {
  return new Request("http://localhost/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer verified-test-token" },
    body: JSON.stringify({
      missionId: "sum-of-two-numbers",
      sourceCode: "def sum_two_numbers(a, b):\n    return a + b",
      language: "python",
      mode,
      learnerId: "attacker-controlled-id",
    }),
  });
}

function configureSuccessfulExecution(returnWrongAnswer = false) {
  mocks.executePython.mockImplementation(async (harnessSource: string) => {
    const argumentLine = harnessSource.match(/^__cq_args = (.+)$/m)?.[1];
    const args = argumentLine ? JSON.parse(argumentLine) as number[] : [];
    return {
      statusId: 3,
      statusDescription: "Accepted",
      stdout: `${HARNESS_MARKER}${JSON.stringify({
        ok: true,
        value: returnWrongAnswer ? 12345 : args.reduce((sum, value) => sum + value, 0),
      })}`,
    };
  });
}

beforeEach(() => {
  mocks.executePython.mockReset();
  mocks.getAuthenticatedUser.mockReset();
  mocks.getBearerTokenFromRequest.mockReset();
  mocks.isSupabaseConfigured.mockReset();
  mocks.isSupabasePersistenceConfigured.mockReset();
  mocks.persistMissionAttempt.mockReset();
  mocks.consumeRunRateLimit.mockReset();
  mocks.getBearerTokenFromRequest.mockImplementation((request: Request) =>
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null,
  );
  mocks.isSupabaseConfigured.mockReturnValue(true);
  mocks.isSupabasePersistenceConfigured.mockReturnValue(true);
  mocks.getAuthenticatedUser.mockResolvedValue({ id: "verified-learner" });
  mocks.persistMissionAttempt.mockResolvedValue({ id: "trusted-attempt", skipped: false });
  mocks.consumeRunRateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/run progress integrity", () => {
  it("persists a passing full submission using only the verified user identity", async () => {
    configureSuccessfulExecution();

    const response = await POST(makeRequest());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.status).toBe("passed");
    expect(result.allPassed).toBe(true);
    expect(result.persistenceStatus).toBe("saved");
    expect(verifyMentorEvidenceToken(result.mentorEvidenceToken, {
      missionId: "sum-of-two-numbers",
      sourceCode: "def sum_two_numbers(a, b):\n    return a + b",
      mode: "submit",
      userId: "verified-learner",
      hintLevel: 1,
    })).toMatchObject({ ok: true, evidence: { status: "passed", category: "PASSED" } });
    expect(result.attemptId).toBe("trusted-attempt");
    expect(mocks.persistMissionAttempt).toHaveBeenCalledWith(expect.objectContaining({
      learnerId: "verified-learner",
      missionId: "sum-of-two-numbers",
      mode: "submit",
      executionStatus: "passed",
      allPassed: true,
    }));
    expect(mocks.persistMissionAttempt).not.toHaveBeenCalledWith(expect.objectContaining({
      learnerId: "attacker-controlled-id",
    }));
    expect(result.tests.filter((test: { id: string }) => !test.id.startsWith("public-")).every(
      (test: { expectedOutput?: string; actualOutput?: string; stdout?: string; stderr?: string; errorMessage?: string }) =>
        test.expectedOutput === undefined
        && test.actualOutput === undefined
        && test.stdout === undefined
        && test.stderr === undefined
        && test.errorMessage === undefined,
    )).toBe(true);
  });

  it("never requests completion persistence for an incorrect submission", async () => {
    configureSuccessfulExecution(true);

    const response = await POST(makeRequest());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.status).toBe("wrong_answer");
    expect(result.allPassed).toBe(false);
    expect(mocks.persistMissionAttempt).toHaveBeenCalledWith(expect.objectContaining({
      executionStatus: "wrong_answer",
      allPassed: false,
    }));
  });

  it("does not persist a completion when the execution provider fails", async () => {
    mocks.executePython.mockRejectedValue(
      new Judge0ServiceError("Provider unavailable.", 503, "provider_unavailable"),
    );

    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    expect(mocks.persistMissionAttempt).not.toHaveBeenCalled();
  });

  it("does not issue learner hint evidence for a Judge0 infrastructure result", async () => {
    mocks.executePython.mockResolvedValue({
      statusId: 13,
      statusDescription: "Internal Error",
    });

    const response = await POST(makeRequest());
    const result = await response.json();

    expect(response.status).toBe(502);
    expect(result.error.code).toBe("judge0_provider_internal_error");
    expect(result.mentorEvidenceToken).toBeUndefined();
    expect(mocks.persistMissionAttempt).not.toHaveBeenCalled();
  });

  it("uses only the verified learner ID for authenticated rate limiting", async () => {
    configureSuccessfulExecution();
    await POST(makeRequest());
    expect(mocks.consumeRunRateLimit).toHaveBeenCalledWith({ kind: "learner", userId: "verified-learner" });
  });

  it("returns 429 before execution when the rate limit is reached", async () => {
    mocks.consumeRunRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 17 });
    const response = await POST(makeRequest());
    const result = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(result.error.code).toBe("rate_limited");
    expect(mocks.executePython).not.toHaveBeenCalled();
  });

  it("rejects oversized streamed bodies without executing code", async () => {
    const response = await POST(new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({ sourceCode: "x".repeat(129 * 1024) }),
    }));
    const result = await response.json();

    expect(response.status).toBe(413);
    expect(result.error.code).toBe("request_too_large");
    expect(mocks.executePython).not.toHaveBeenCalled();
  });

  it("does not persist or issue evidence when the harness result is malformed", async () => {
    mocks.executePython.mockResolvedValue({ statusId: 3, statusDescription: "Accepted", stdout: "unrecognized output" });

    const response = await POST(makeRequest());
    const result = await response.json();

    expect(response.status).toBe(502);
    expect(result.error.code).toBe("judge0_invalid_response");
    expect(mocks.persistMissionAttempt).not.toHaveBeenCalled();
    expect(result.mentorEvidenceToken).toBeUndefined();
  });

  it("uses public examples for Run and the full suite for Submit", async () => {
    configureSuccessfulExecution();

    const runResponse = await POST(makeRequest("run"));
    const runResult = await runResponse.json();
    const submitResponse = await POST(makeRequest("submit"));
    const submitResult = await submitResponse.json();

    expect(runResult.totalTests).toBeLessThan(submitResult.totalTests);
    expect(runResult.tests.every((test: { id: string }) => test.id.startsWith("public-"))).toBe(true);
    expect(submitResult.tests.some((test: { id: string }) => !test.id.startsWith("public-"))).toBe(true);
  });

  it("reports database persistence failure separately from a genuinely passing execution", async () => {
    configureSuccessfulExecution();
    mocks.persistMissionAttempt.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(makeRequest());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.status).toBe("passed");
    expect(result.allPassed).toBe(true);
    expect(result.persistenceStatus).toBe("failed");
    expect(result.attemptId).toBeUndefined();
  });
});
