import { describe, expect, it } from "vitest";
import { createDemoExecutionResult } from "@/lib/demo-execution";

describe("deterministic demo execution", () => {
  it("returns explicitly simulated public samples without a passing result", () => {
    const result = createDemoExecutionResult("sum-of-two-numbers", "submit");

    expect(result.executionSource).toBe("demo");
    expect(result.isSimulated).toBe(true);
    expect(result.isMock).toBe(true);
    expect(result.status).toBe("simulated");
    expect(result.allPassed).toBe(false);
    expect(result.passedTests).toBe(0);
    expect(result.summary).toContain("not executed");
    expect(result.tests.every((test) => test.status === "simulated")).toBe(true);
    expect(result.tests.map((test) => test.id)).not.toContain("hidden-1");
    expect(result.tests.map((test) => test.id)).not.toContain("hidden-2");
  });
});
