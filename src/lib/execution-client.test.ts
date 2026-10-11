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

  it("defaults client requests to demo mode and validates the simulated response", async () => {
    vi.stubGlobal("window", globalThis);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "simulated",
      executionSource: "demo",
      isSimulated: true,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeMission(
      "sum-of-two-numbers",
      "def sum_two_numbers(a, b): return a + b",
      "run",
    );

    expect(result.executionSource).toBe("demo");
    expect(result.isSimulated).toBe(true);
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({ mode: "run", executionSource: "demo" });
  });
});
