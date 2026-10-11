import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executePython: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getBearerTokenFromRequest: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  isSupabasePersistenceConfigured: vi.fn(),
  persistMissionAttempt: vi.fn(),
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
  mocks.getBearerTokenFromRequest.mockImplementation((request: Request) =>
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null,
  );
  mocks.isSupabaseConfigured.mockReturnValue(true);
  mocks.isSupabasePersistenceConfigured.mockReturnValue(true);
  mocks.getAuthenticatedUser.mockResolvedValue({ id: "verified-learner" });
  mocks.persistMissionAttempt.mockResolvedValue({ id: "trusted-attempt", skipped: false });
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

    expect(response.status).toBe(200);
    expect(result.status).toBe("execution_error");
    expect(result.mentorEvidenceToken).toBeUndefined();
    expect(mocks.persistMissionAttempt).toHaveBeenCalledWith(expect.objectContaining({
      executionStatus: "execution_error",
      mistakeCategory: undefined,
    }));
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
