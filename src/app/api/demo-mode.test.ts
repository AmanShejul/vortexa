import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/run/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/run demo mode", () => {
  it("does not require Judge0 and never returns hidden tests", async () => {
    const response = await POST(new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({
        missionId: "sum-of-two-numbers",
        sourceCode: "raise RuntimeError('this must never run')",
        language: "python",
        mode: "submit",
        executionSource: "demo",
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.executionSource).toBe("demo");
    expect(payload.isSimulated).toBe(true);
    expect(payload.allPassed).toBe(false);
    expect(payload.mentorEvidenceToken).toBeUndefined();
    expect(payload.tests.every((test: { id: string }) => !test.id.startsWith("hidden-"))).toBe(true);
  });

  it("rejects an unknown execution source", async () => {
    const response = await POST(new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({
        missionId: "sum-of-two-numbers",
        sourceCode: "def sum_two_numbers(a, b): return a + b",
        language: "python",
        mode: "run",
        executionSource: "pretend-live",
      }),
    }));

    expect(response.status).toBe(400);
  });

  it("returns a clear configuration error when live mode is explicitly selected without Judge0", async () => {
    vi.stubEnv("JUDGE0_API_URL", "");
    const response = await POST(new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({
        missionId: "sum-of-two-numbers",
        sourceCode: "def sum_two_numbers(a, b): return a + b",
        language: "python",
        mode: "run",
        executionSource: "live",
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe("judge0_configuration_missing");
  });
});
