import { describe, expect, it } from "vitest";
import { buildProgressSummary, ensureUserMatchesRecord, normalizeAttemptOutcome, shouldCompleteMission } from "@/lib/learner-persistence";

describe("learner persistence helpers", () => {
  it("maps execution outputs to persisted attempt categories", () => {
    expect(normalizeAttemptOutcome("passed")).toBe("passed");
    expect(normalizeAttemptOutcome("wrong_answer")).toBe("wrong_answer");
    expect(normalizeAttemptOutcome("compilation_error")).toBe("syntax_error");
    expect(normalizeAttemptOutcome("runtime_error")).toBe("runtime_error");
    expect(normalizeAttemptOutcome("time_limit_exceeded")).toBe("timeout");
    expect(normalizeAttemptOutcome("execution_error")).toBe("infrastructure_error");
  });

  it("only marks a mission complete when the trusted server result passed", () => {
    expect(shouldCompleteMission({ status: "passed", allPassed: true, mode: "submit" })).toBe(true);
    expect(shouldCompleteMission({ status: "passed", allPassed: true, mode: "run" })).toBe(false);
    expect(shouldCompleteMission({ status: "wrong_answer", allPassed: false, mode: "submit" })).toBe(false);
    expect(shouldCompleteMission({ status: "passed", allPassed: false, mode: "submit" })).toBe(false);
  });

  it("enforces learner ownership", () => {
    expect(() => ensureUserMatchesRecord("learner-a", "learner-a")).not.toThrow();
    expect(() => ensureUserMatchesRecord("learner-a", "learner-b")).toThrow("not allowed");
  });

  it("calculates dashboard metrics from real data", () => {
    const summary = buildProgressSummary({
      attempts: [
        { id: "a1", learnerId: "user-1", missionId: "sum-of-two-numbers", executionStatus: "passed", passedTests: 3, totalTests: 3, createdAt: "2025-01-01T00:00:00Z", mode: "run" },
        { id: "a2", learnerId: "user-1", missionId: "sum-of-two-numbers", executionStatus: "wrong_answer", passedTests: 1, totalTests: 3, createdAt: "2025-01-02T00:00:00Z", mode: "submit" },
      ],
      completions: [{ id: "c1", learnerId: "user-1", missionId: "sum-of-two-numbers", completedAt: "2025-01-01T00:00:00Z", passedTests: 3, totalTests: 3 }],
      mistakes: [{ id: "m1", learnerId: "user-1", missionId: "sum-of-two-numbers", category: "INCORRECT_LOGIC", occurrenceCount: 2, lastSeenAt: "2025-01-02T00:00:00Z" }],
    });

    expect(summary.missionsCompleted).toBe(1);
    expect(summary.totalAttempts).toBe(2);
    expect(summary.successRate).toBe(50);
    expect(summary.repeatedMistakes[0]?.category).toBe("INCORRECT_LOGIC");
    expect(summary.empty).toBe(false);
  });

  it("builds an honest beginner recommendation for a new learner", () => {
    const summary = buildProgressSummary({ attempts: [], completions: [], mistakes: [] });

    expect(summary.empty).toBe(true);
    expect(summary.recommendations[0]).toMatchObject({ difficulty: "Beginner" });
    expect(summary.recommendations[0]?.missionId).toBeTruthy();
    expect(summary.recommendations[0]?.explanation).toContain("not enough learner history");
  });
});
