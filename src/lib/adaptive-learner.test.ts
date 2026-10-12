import { describe, expect, it } from "vitest";
import { analyzeMistake, buildLearnerAnalytics } from "@/lib/adaptive-learner";
import { getMission, missions } from "@/lib/missions";

const now = "2026-01-01T00:00:00.000Z";

function result(overrides: Partial<Parameters<typeof analyzeMistake>[0]["executionResult"]> = {}) {
  return {
    status: "wrong_answer" as const,
    allPassed: false,
    tests: [{ id: "public-1", label: "Example", status: "failed" as const, expectedOutput: "15", actualOutput: "14" }],
    ...overrides,
  };
}

describe("adaptive learner intelligence", () => {
  it("classifies a supported off-by-one signal from boundary output and loop evidence", () => {
    const mission = getMission("sum-from-one-to-n");
    expect(mission).toBeDefined();
    const analysis = analyzeMistake({
      mission: mission!,
      sourceCode: "def sum_to_n(n):\n    return sum(range(1, n))",
      executionResult: result(),
      testCases: [{ id: "public-1", label: "Boundary example", args: [5], expected: 15, result: result().tests[0] }],
    });
    expect(analysis).toMatchObject({ category: "OFF_BY_ONE", ambiguous: false, confidence: "medium" });
  });

  it("classifies an explicit empty-input failure", () => {
    const mission = getMission("sort-numbers");
    const analysis = analyzeMistake({
      mission: mission!,
      sourceCode: "def sort_numbers(numbers):\n    return sorted(numbers)",
      executionResult: result({ tests: [{ id: "public-2", label: "Sort empty list", status: "failed", expectedOutput: "[]", actualOutput: "[1]" }] }),
      testCases: [{ id: "public-2", label: "Sort empty list", args: [[]], expected: [], result: { status: "failed", expectedOutput: "[]", actualOutput: "[1]" } }],
    });
    expect(analysis.category).toBe("EMPTY_INPUT_UNHANDLED");
    expect(analysis.confidence).toBe("high");
  });

  it("marks a generic wrong answer as ambiguous instead of inventing a diagnosis", () => {
    const mission = getMission("sum-of-two-numbers");
    const analysis = analyzeMistake({
      mission: mission!,
      sourceCode: "def sum_two_numbers(a, b):\n    return a + b",
      executionResult: result(),
    });
    expect(analysis).toMatchObject({ category: "INCORRECT_LOGIC", ambiguous: true, confidence: "low" });
  });

  it("tracks recurrence across missions and improvement after a passing retest", () => {
    const analytics = buildLearnerAnalytics({
      missions,
      completions: [],
      attempts: [
        { missionId: "sum-from-one-to-n", executionStatus: "wrong_answer", passedTests: 1, totalTests: 2, mode: "submit", mistakeCategory: "OFF_BY_ONE", mistakeConcept: "Loops", mistakeConfidence: "medium", createdAt: "2026-01-01T00:00:00.000Z" },
        { missionId: "binary-search", executionStatus: "wrong_answer", passedTests: 1, totalTests: 3, mode: "submit", mistakeCategory: "OFF_BY_ONE", mistakeConcept: "Loop invariants", mistakeConfidence: "medium", createdAt: "2026-01-02T00:00:00.000Z" },
        { missionId: "binary-search", executionStatus: "passed", passedTests: 3, totalTests: 3, mode: "submit", createdAt: "2026-01-03T00:00:00.000Z" },
      ],
    });
    expect(analytics.mistakePatterns[0]).toMatchObject({ category: "OFF_BY_ONE", occurrences: 2, isRecurring: true, improving: true });
    expect(analytics.mistakePatterns[0].missionIds).toEqual(expect.arrayContaining(["sum-from-one-to-n", "binary-search"]));
  });

  it("requires evidence before declaring a concept strong and marks a weak concept", () => {
    const analytics = buildLearnerAnalytics({
      missions,
      completions: [],
      attempts: [
        { missionId: "sum-from-one-to-n", executionStatus: "wrong_answer", passedTests: 0, totalTests: 2, mode: "run", createdAt: now },
        { missionId: "sum-from-one-to-n", executionStatus: "wrong_answer", passedTests: 0, totalTests: 2, mode: "submit", createdAt: "2026-01-02T00:00:00.000Z" },
      ],
    });
    const loops = analytics.conceptStats.find((stat) => /loop/i.test(stat.concept));
    expect(loops).toMatchObject({ sampleSize: 2, proficiency: "needs_practice", successRate: 0 });
    const oneSample = buildLearnerAnalytics({
      missions,
      attempts: [{ missionId: "sum-from-one-to-n", executionStatus: "passed", passedTests: 2, totalTests: 2, mode: "submit", createdAt: now }],
    }).conceptStats.find((stat) => /loop/i.test(stat.concept));
    expect(oneSample?.proficiency).toBe("insufficient_evidence");
  });

  it("recommends only canonical missions and gives a useful new-learner fallback", () => {
    const fresh = buildLearnerAnalytics({ missions, attempts: [] });
    expect(fresh.recommendations[0]?.difficulty).toBe("Beginner");
    expect(missions.some((mission) => mission.id === fresh.recommendations[0]?.missionId)).toBe(true);

    const targeted = buildLearnerAnalytics({
      missions,
      completions: [{ missionId: "sum-from-one-to-n" }],
      attempts: [
        { missionId: "sum-from-one-to-n", executionStatus: "wrong_answer", passedTests: 0, totalTests: 2, mode: "submit", mistakeCategory: "OFF_BY_ONE", mistakeConcept: "Loops", createdAt: now },
        { missionId: "sum-from-one-to-n", executionStatus: "wrong_answer", passedTests: 0, totalTests: 2, mode: "submit", mistakeCategory: "OFF_BY_ONE", mistakeConcept: "Loops", createdAt: "2026-01-02T00:00:00.000Z" },
      ],
    });
    expect(targeted.recommendations[0]?.missionId).not.toBe("sum-from-one-to-n");
    expect(targeted.recommendations[0]?.explanation).toContain("recorded attempts");
    expect(targeted.recommendations.every((item) => missions.some((mission) => mission.id === item.missionId))).toBe(true);
  });
});
