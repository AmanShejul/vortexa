import { describe, expect, it } from "vitest";
import { missions } from "@/lib/missions";
import { getMissionTestCases } from "@/lib/mission-tests";
import { validateTestCase } from "@/lib/python-harness";

describe("canonical mission catalog", () => {
  it("provides stable IDs, slugs, topics, hints, and test suites for every mission", () => {
    const ids = missions.map((mission) => mission.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const mission of missions) {
      expect(mission.slug).toBe(mission.id);
      expect(mission.topic.length).toBeGreaterThan(0);
      expect(mission.hintMetadata.focusAreas.length).toBeGreaterThan(0);
      const publicCases = getMissionTestCases(mission.id, "run");
      const fullSuite = getMissionTestCases(mission.id, "submit");

      expect(publicCases.length).toBeGreaterThan(0);
      expect(fullSuite.length).toBeGreaterThan(publicCases.length);
      expect(publicCases.every((testCase) => testCase.id.startsWith("public-"))).toBe(true);
      expect(fullSuite.some((testCase) => testCase.id.startsWith("hidden-"))).toBe(true);
      for (const testCase of fullSuite) validateTestCase(mission, testCase);
    }
  });

  it("covers the requested algorithm and data-structure topics with both execution formats", () => {
    const categories = new Set(missions.map((mission) => mission.category));
    for (const category of [
      "Fundamentals",
      "Conditionals",
      "Loops",
      "Arrays",
      "Strings",
      "Searching & Sorting",
      "Recursion",
      "Hash Maps",
      "Stacks & Queues",
      "Linked Lists",
      "Trees",
      "Graphs",
      "Dynamic Programming",
      "Input / Output",
    ]) {
      expect(categories.has(category as (typeof missions)[number]["category"])).toBe(true);
    }
    expect(missions.some((mission) => mission.execution.kind === "stdin_stdout")).toBe(true);
    expect(missions.some((mission) => mission.execution.kind === "function")).toBe(true);
  });
});
