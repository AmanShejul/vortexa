import { describe, expect, it } from "vitest";
import { getSafeExecutionError } from "@/lib/execution-client";

describe("execution client errors", () => {
  it("explains the missing Judge0 endpoint instead of masking it as an outage", () => {
    expect(getSafeExecutionError(503, {
      error: {
        code: "judge0_configuration_missing",
        message: "Code execution service is not configured.",
      },
    })).toContain("JUDGE0_API_URL");
  });

  it("does not expose provider response details for generic upstream failures", () => {
    expect(getSafeExecutionError(503, {
      error: {
        code: "judge0_provider_unavailable",
        message: "private upstream detail",
      },
    })).toBe("The code execution service is unavailable. Please try again in a moment.");
  });
});
