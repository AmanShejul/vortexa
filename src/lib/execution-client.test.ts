import { describe, expect, it, vi } from "vitest";
import { executeMission, getSafeExecutionError } from "@/lib/execution-client";

vi.mock("@/lib/supabase", () => ({
  getBrowserAccessToken: async () => null,
}));

describe("execution client errors", () => {
  it("explains the missing Judge0 endpoint instead of masking it as an outage", () => {
    expect(getSafeExecutionError(503, {
      error: {
        code: "judge0_configuration_missing",
        message: "Code execution service is not configured.",
      },
    })).toMatch(/Local Python.*JUDGE0_API_URL/i);
  });

  it("surfaces a server execution failure to the submission caller", async () => {
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "judge0_configuration_missing" },
    }), { status: 503, headers: { "Content-Type": "application/json" } })));

    await expect(executeMission(
      "sum-of-two-numbers",
      "def sum_two_numbers(a, b): return a + b",
      "submit",
    )).rejects.toThrow(/Judge0.*not configured/i);
  });

  it("maps placeholder Judge0 configuration to an actionable Submit error", async () => {
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "judge0_configuration_missing" },
    }), { status: 503, headers: { "Content-Type": "application/json" } })));

    await expect(executeMission(
      "sum-of-two-numbers",
      "def sum_two_numbers(a, b): return a + b",
      "submit",
    )).rejects.toThrow(/Judge0.*not configured.*Local Python/i);
  });

  it("does not expose provider response details for generic upstream failures", () => {
    expect(getSafeExecutionError(503, {
      error: {
        code: "judge0_provider_unavailable",
        message: "private upstream detail",
      },
    })).toContain("Live Judge0 execution is unavailable");
  });

  it("explains that provider-unavailable errors are server connectivity failures", () => {
    expect(getSafeExecutionError(503, {
      error: { code: "judge0_provider_unavailable", message: "private network detail" },
    })).toMatch(/Next\.js server could not reach Judge0.*restart Next\.js/i);
  });

  it("maps Judge0 queue overloads separately from server connectivity failures", () => {
    expect(getSafeExecutionError(503, {
      error: { code: "judge0_provider_overloaded" },
    })).toMatch(/queueing too many submissions/i);
  });

  it("routes Live Judge0 only when explicitly selected", async () => {
    vi.stubGlobal("window", globalThis);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "wrong_answer",
      executionSource: "live",
      executionScope: "full_suite",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeMission(
      "sum-of-two-numbers",
      "def sum_two_numbers(a, b): return a - b",
      "submit",
      "live",
    );

    expect(result.executionSource).toBe("live");
    expect(fetchMock).toHaveBeenCalledWith("/api/run", expect.objectContaining({ method: "POST" }));
  });

  it("keeps Run code local but sends Submit mission to the trusted server", async () => {
    vi.stubGlobal("window", globalThis);
    const cases = [
      { id: "public-1", label: "Example 1", args: [2, 3], expected: 5 },
    ];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      execution: {
        kind: "function",
        functionName: "sum_two_numbers",
        parameters: [{ name: "a", type: "integer" }, { name: "b", type: "integer" }],
        returnType: "integer",
      },
      tests: cases,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    let workerRequest: Record<string, unknown> | undefined;
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      postMessage(message: Record<string, unknown>) {
        workerRequest = message;
        const requestId = message.requestId as number;
        const requestedCases = message.testCases as Array<{ id: string; label: string }>;
        queueMicrotask(() => this.onmessage?.({ data: { type: "ready", requestId } } as MessageEvent));
        queueMicrotask(() => this.onmessage?.({
          data: {
            type: "result",
            requestId,
            result: {
              tests: requestedCases.map((test) => ({ ...test, status: "passed" })),
              passedTests: requestedCases.length,
              failedTests: 0,
              allPassed: true,
            },
          },
        } as MessageEvent));
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", FakeWorker);

    const runResult = await executeMission(
      "sum-of-two-numbers",
      "def sum_two_numbers(a, b): return a + b",
      "run",
    );

    expect(runResult.executionSource).toBe("local");
    expect(runResult.executionScope).toBe("public_tests_only");
    expect(workerRequest).toMatchObject({
      execution: { kind: "function", functionName: "sum_two_numbers" },
      testCases: cases,
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      status: "passed",
      executionSource: "live",
      executionScope: "full_suite",
      summary: "All 4 tests passed.",
      completedAt: new Date().toISOString(),
      tests: [],
      totalTests: 4,
      passedTests: 4,
      failedTests: 0,
      allPassed: true,
      mode: "submit",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const submitResult = await executeMission(
      "sum-of-two-numbers",
      "def sum_two_numbers(a, b): return a + b",
      "submit",
    );

    expect(submitResult.executionSource).toBe("live");
    expect(submitResult.executionScope).toBe("full_suite");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/run", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"mode":"submit"'),
    }));
  });
});
