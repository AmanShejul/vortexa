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
    })).toMatch(/switch to Demo mode.*JUDGE0_API_URL/i);
  });

  it("does not expose provider response details for generic upstream failures", () => {
    expect(getSafeExecutionError(503, {
      error: {
        code: "judge0_provider_unavailable",
        message: "private upstream detail",
      },
    })).toContain("Live Python execution is unavailable");
  });

  it("routes explicit demo mode to the server evaluator", async () => {
    vi.stubGlobal("window", globalThis);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "simulated",
      executionSource: "demo",
      executionScope: "simulation",
      isSimulated: true,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeMission(
      "sum-of-two-numbers",
      "def sum_two_numbers(a, b): return a + b",
      "run",
      "demo",
    );

    expect(result.executionSource).toBe("demo");
    expect(result.isSimulated).toBe(true);
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({ mode: "run", executionSource: "demo" });
  });

  it("routes Live Judge0 only when explicitly selected", async () => {
    vi.stubGlobal("window", globalThis);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "wrong_answer",
      executionSource: "live",
      executionScope: "full_suite",
      isSimulated: false,
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

  it("defaults to local Python and sends only public tests to the worker", async () => {
    vi.stubGlobal("window", globalThis);
    const cases = [
      { id: "public-1", label: "Example 1", args: [2, 3], expected: 5 },
    ];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      functionName: "sum_two_numbers",
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

    const result = await executeMission(
      "sum-of-two-numbers",
      "def sum_two_numbers(a, b): return a + b",
      "submit",
    );

    expect(result.executionSource).toBe("local");
    expect(result.executionScope).toBe("public_tests_only");
    expect(result.summary).toContain("hidden tests were not run");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/missions/tests?missionId=sum-of-two-numbers",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock.mock.calls[0][0]).not.toBe("/api/run");
    expect(workerRequest).toMatchObject({ functionName: "sum_two_numbers", testCases: cases });
  });
});
