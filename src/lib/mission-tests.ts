import { missions } from "@/lib/missions";
import type { ExecutionMode } from "@/types";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ServerTestCase {
  id: string;
  label: string;
  args: JsonValue[];
  expected: JsonValue;
}

interface MissionTestSuite {
  public: ServerTestCase[];
  hidden: ServerTestCase[];
}

const missionTestSuites: Record<string, MissionTestSuite> = {
  "sum-of-two-numbers": {
    public: [
      { id: "public-1", label: "Example 1", args: [2, 3], expected: 5 },
      { id: "public-2", label: "Example 2", args: [-4, 9], expected: 5 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [0, 0], expected: 0 },
      { id: "hidden-2", label: "Private test 2", args: [-1000000, 999999], expected: -1 },
    ],
  },
  "even-or-odd": {
    public: [
      { id: "public-1", label: "Example 1", args: [8], expected: "Even" },
      { id: "public-2", label: "Example 2", args: [13], expected: "Odd" },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [0], expected: "Even" },
      { id: "hidden-2", label: "Private test 2", args: [-7], expected: "Odd" },
    ],
  },
  "sum-from-one-to-n": {
    public: [
      { id: "public-1", label: "Example 1", args: [5], expected: 15 },
      { id: "public-2", label: "Example 2", args: [1], expected: 1 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [0], expected: 0 },
      { id: "hidden-2", label: "Private test 2", args: [100], expected: 5050 },
    ],
  },
  "find-largest-number": {
    public: [
      { id: "public-1", label: "Example 1", args: [[3, 8, 2, 5]], expected: 8 },
      { id: "public-2", label: "Example 2", args: [[-4, -1, -7]], expected: -1 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [[6, 6, 6]], expected: 6 },
      { id: "hidden-2", label: "Private test 2", args: [[-10, 0, -3]], expected: 0 },
    ],
  },
  "count-vowels": {
    public: [
      { id: "public-1", label: "Example 1", args: ["CodeQuest"], expected: 3 },
      { id: "public-2", label: "Example 2", args: ["rhythm"], expected: 0 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: ["AEIOU"], expected: 5 },
      { id: "hidden-2", label: "Private test 2", args: [""], expected: 0 },
    ],
  },
};

for (const mission of missions) {
  const suite = missionTestSuites[mission.id];
  if (!suite || suite.public.length === 0 || suite.hidden.length === 0) {
    throw new Error(`Missing execution tests for canonical mission: ${mission.id}`);
  }
}

export function getMissionTestCases(missionId: string, mode: ExecutionMode): ServerTestCase[] {
  const suite = missionTestSuites[missionId];
  if (!suite) throw new Error(`Missing execution tests for mission: ${missionId}`);
  return mode === "run" ? suite.public : [...suite.public, ...suite.hidden];
}
