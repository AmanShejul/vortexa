import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLocalAttempts,
  getRepeatedMistakePatterns,
  getWeakestConcepts,
  recordLocalAttempt,
  suggestNextMissionId,
} from "@/lib/learner-patterns";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
});

describe("learner-patterns", () => {
  it("detects a mistake repeated across different missions", () => {
    recordLocalAttempt({ missionId: "sum-of-two-numbers", category: "INCORRECT_LOGIC", concepts: ["Functions"], passed: false });
    recordLocalAttempt({ missionId: "two-sum", category: "INCORRECT_LOGIC", concepts: ["Lists"], passed: false });
    recordLocalAttempt({ missionId: "two-sum", category: "OFF_BY_ONE", concepts: ["Lists"], passed: false });

    const patterns = getRepeatedMistakePatterns(2);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].category).toBe("INCORRECT_LOGIC");
    expect(patterns[0].occurrences).toBe(2);
    expect(patterns[0].missionIds).toEqual(expect.arrayContaining(["sum-of-two-numbers", "two-sum"]));
  });

  it("ignores passed attempts when building patterns", () => {
    recordLocalAttempt({ missionId: "sum-of-two-numbers", category: "PASSED", concepts: ["Functions"], passed: true });
    recordLocalAttempt({ missionId: "two-sum", category: "PASSED", concepts: ["Lists"], passed: true });
    expect(getRepeatedMistakePatterns(1)).toHaveLength(0);
    expect(getLocalAttempts()).toHaveLength(2);
  });

  it("ranks the weakest concept first", () => {
    recordLocalAttempt({ missionId: "sum-from-one-to-n", category: "OFF_BY_ONE", concepts: ["For loops"], passed: false });
    recordLocalAttempt({ missionId: "sum-from-one-to-n", category: "OFF_BY_ONE", concepts: ["For loops"], passed: false });
    recordLocalAttempt({ missionId: "count-vowels", category: "PASSED", concepts: ["Strings"], passed: true });
    recordLocalAttempt({ missionId: "count-vowels", category: "PASSED", concepts: ["Strings"], passed: true });

    const weakest = getWeakestConcepts(2);
    expect(weakest[0].concept).toBe("For loops");
    expect(weakest[0].failures).toBe(2);
  });

  it("suggests an uncompleted mission matching the weakest concept", () => {
    recordLocalAttempt({ missionId: "sum-from-one-to-n", category: "OFF_BY_ONE", concepts: ["For loops"], passed: false });
    recordLocalAttempt({ missionId: "sum-from-one-to-n", category: "OFF_BY_ONE", concepts: ["For loops"], passed: false });

    const candidateMissions = [
      { id: "sum-from-one-to-n", concepts: ["For loops"] },
      { id: "find-largest-number", concepts: ["Lists"] },
    ];
    expect(suggestNextMissionId(candidateMissions, ["sum-from-one-to-n"])).toBe("find-largest-number");
  });

  it("returns null when every mission is completed", () => {
    recordLocalAttempt({ missionId: "sum-of-two-numbers", category: "INCORRECT_LOGIC", concepts: ["Functions"], passed: false });
    recordLocalAttempt({ missionId: "sum-of-two-numbers", category: "INCORRECT_LOGIC", concepts: ["Functions"], passed: false });
    const candidateMissions = [{ id: "sum-of-two-numbers", concepts: ["Functions"] }];
    expect(suggestNextMissionId(candidateMissions, ["sum-of-two-numbers"])).toBeNull();
  });

  it("does not count a retried submission twice when it has the same submission reference", () => {
    const attempt = {
      missionId: "sum-of-two-numbers",
      category: "INCORRECT_LOGIC",
      concepts: ["Functions"],
      passed: false,
      submissionId: "submission-retry-1",
    };
    recordLocalAttempt(attempt);
    recordLocalAttempt(attempt);
    expect(getLocalAttempts()).toHaveLength(1);
  });
});
