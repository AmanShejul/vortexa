import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMentorEvidenceToken } from "@/lib/mentor-evidence";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}));

import { POST } from "@/app/api/hint/route";

const missionId = "sum-of-two-numbers";
const sourceCode = "def sum_two_numbers(a, b):\n    return a - b";

function token(overrides: Partial<Parameters<typeof createMentorEvidenceToken>[0]> = {}, now = Date.now()) {
  return createMentorEvidenceToken({
    missionId,
    sourceCode,
    mode: "run",
    userId: null,
    status: "wrong_answer",
    category: "INCORRECT_LOGIC",
    ...overrides,
  }, now);
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/hint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(evidenceToken = token(), hintLevel = 1) {
  return {
    missionId,
    sourceCode,
    evidenceToken,
    mode: "run",
    hintLevel,
  };
}

beforeEach(() => {
  mocks.getAuthenticatedUser.mockReset();
  mocks.isSupabaseConfigured.mockReset();
  mocks.isSupabaseConfigured.mockReturnValue(false);
  mocks.getAuthenticatedUser.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/hint trusted evidence", () => {
  it("ignores client-supplied pass, score, result, and mistake-category claims", async () => {
    const response = await POST(request({
      ...validBody(),
      passed: true,
      score: 100,
      mistakeCategory: "PASSED",
      executionResult: {
        status: "passed",
        allPassed: true,
        passedTests: 500,
        tests: [{ id: "hidden-1", expectedOutput: "forged secret", actualOutput: "forged secret" }],
      },
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.category).toBe("INCORRECT_LOGIC");
    expect(result.hintLevel).toBe(1);
    expect(result.hint).toContain("failing public example");
    expect(JSON.stringify(result)).not.toContain("forged secret");
  });

  it("rejects evidence bound to another user", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "learner-b" });

    const response = await POST(request(validBody(token({ userId: "learner-a" }))));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("different learner");
  });

  it.each([
    ["mission", { missionId: "even-or-odd" }],
    ["code", { sourceCode: "def sum_two_numbers(a, b):\n    return a + b" }],
    ["mode", { mode: "submit" }],
  ])("rejects evidence when the %s binding differs", async (_binding, override) => {
    const response = await POST(request({ ...validBody(), ...override }));

    expect(response.status).toBe(409);
  });

  it("rejects missing, malformed, and expired evidence", async () => {
    const missing = await POST(request({
      ...validBody(""),
      attemptId: "client-claimed-attempt",
      executionResult: { status: "passed", allPassed: true },
    }));
    const malformed = await POST(request(validBody("not-a-signed-token")));
    const expiredToken = token({}, Date.now() - 11 * 60 * 1000);
    const expired = await POST(request(validBody(expiredToken)));

    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(expired.status).toBe(410);
  });

  it("rejects a payload altered after it was signed", async () => {
    const signed = token();
    const [payload, signature] = signed.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { category: string };
    claims.category = "PASSED";
    const altered = `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`;

    const response = await POST(request(validBody(altered)));

    expect(response.status).toBe(400);
  });

  it("does not classify an execution failure as a learner mistake", async () => {
    const failedEvidence = token({
      status: "execution_error",
      category: "UNKNOWN_ERROR",
    });

    const response = await POST(request(validBody(failedEvidence)));
    const result = await response.json();

    expect(response.status).toBe(422);
    expect(result.error).toContain("reliable evidence");
  });

  it("serves each existing progressive level from signed execution evidence only", async () => {
    const responses: Response[] = [];
    const results: Array<Record<string, unknown>> = [];
    let evidenceToken = token();
    for (const level of [1, 2, 3]) {
      const response = await POST(request(validBody(evidenceToken, level)));
      const result = await response.json() as Record<string, unknown>;
      responses.push(response);
      results.push(result);
      if (typeof result.nextEvidenceToken === "string") evidenceToken = result.nextEvidenceToken;
    }

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(results.map((result) => result.hintLevel)).toEqual([1, 2, 3]);
    expect(results.slice(0, 2).every((result) => typeof result.nextEvidenceToken === "string")).toBe(true);
    expect(results[2]?.nextEvidenceToken).toBeUndefined();
    expect(results.every((result) => result.category === "INCORRECT_LOGIC" && result.isFallback)).toBe(true);
    expect(results.every((result) => typeof result.explanation === "string" && result.explanation.length > 0)).toBe(true);
    expect(results.every((result) => typeof result.hint === "string" && result.hint.length > 0)).toBe(true);
    expect(JSON.stringify(results)).not.toMatch(/return a \+ b|number % 2|hidden-1|-1000000|5050/);
  });

  it("requires the signed hint reference for the preceding level before advancing", async () => {
    const response = await POST(request(validBody(token(), 2)));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("previous hint");
  });

  it("keeps guest hint verification operational when Supabase is unconfigured", async () => {
    const response = await POST(request(validBody()));

    expect(response.status).toBe(200);
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
  });
});
