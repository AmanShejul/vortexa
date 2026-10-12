import { missions } from "@/lib/missions";
import type { ExecutionMode } from "@/types";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface FunctionServerTestCase {
  id: string;
  label: string;
  args: JsonValue[];
  expected: JsonValue;
}

export interface StdioServerTestCase {
  id: string;
  label: string;
  stdin: string;
  expectedStdout: string;
}

export type ServerTestCase = FunctionServerTestCase | StdioServerTestCase;

interface MissionTestSuite {
  public: ServerTestCase[];
  hidden: ServerTestCase[];
}

const missionTestSuites: Record<string, MissionTestSuite> = {
  "sum-of-two-numbers": {
    public: [
      { id: "public-1", label: "Example 1", args: [2, 3], expected: 5 },
      { id: "public-2", label: "Example 2", args: [1, 2], expected: 3 },
      { id: "public-3", label: "Zero values", args: [0, 0], expected: 0 },
      { id: "public-4", label: "Negative and positive values", args: [-4, 9], expected: 5 },
      { id: "public-5", label: "Negative total", args: [-8, 3], expected: -5 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [123456, -123456], expected: 0 },
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
      { id: "public-1", label: "Example 1", args: ["CodeQuest"], expected: 4 },
      { id: "public-2", label: "Example 2", args: ["rhythm"], expected: 0 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: ["AEIOU"], expected: 5 },
      { id: "hidden-2", label: "Private test 2", args: [""], expected: 0 },
    ],
  },
  "factorial-number": {
    public: [
      { id: "public-1", label: "Example 1", args: [0], expected: 1 },
      { id: "public-2", label: "Example 2", args: [5], expected: 120 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [1], expected: 1 },
      { id: "hidden-2", label: "Private test 2", args: [20], expected: 2432902008176640000 },
    ],
  },
  "palindrome-check": {
    public: [
      { id: "public-1", label: "Example 1", args: ["RaceCar"], expected: true },
      { id: "public-2", label: "Example 2", args: ["Hello"], expected: false },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: ["A man"], expected: false },
      { id: "hidden-2", label: "Private test 2", args: [""], expected: true },
    ],
  },
  "reverse-string": {
    public: [
      { id: "public-1", label: "Example 1", args: ["hello"], expected: "olleh" },
      { id: "public-2", label: "Example 2", args: ["Python 3!"], expected: "!3 nohtyP" },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [""], expected: "" },
      { id: "hidden-2", label: "Private test 2", args: ["a b"], expected: "b a" },
    ],
  },
  "largest-of-three": {
    public: [
      { id: "public-1", label: "Example 1", args: [4, 9, 2], expected: 9 },
      { id: "public-2", label: "Example 2", args: [-8, -3, -12], expected: -3 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [7, 7, 3], expected: 7 },
      { id: "hidden-2", label: "Private test 2", args: [-4, -4, -4], expected: -4 },
    ],
  },
  "longest-substring": {
    public: [
      { id: "public-1", label: "Example 1", args: ["abcabcbb"], expected: 3 },
      { id: "public-2", label: "Example 2", args: ["bbbbb"], expected: 1 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: ["pwwkew"], expected: 3 },
      { id: "hidden-2", label: "Private test 2", args: [""], expected: 0 },
      { id: "hidden-3", label: "Private test 3", args: ["a b"], expected: 3 },
    ],
  },
  "two-sum": {
    public: [
      { id: "public-1", label: "Example 1", args: [[2, 7, 11, 15], 9], expected: true },
      { id: "public-2", label: "Example 2", args: [[1, 2, 4], 8], expected: false },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [[3, 3, 8], 6], expected: true },
      { id: "hidden-2", label: "Private test 2", args: [[3], 6], expected: false },
      { id: "hidden-3", label: "Private test 3", args: [[-5, 2, 8, -1], 7], expected: true },
      { id: "hidden-4", label: "Private test 4", args: [[], 0], expected: false },
    ],
  },
  "second-largest-number": {
    public: [
      { id: "public-1", label: "Example 1", args: [[4, 1, 7, 3, 5]], expected: 5 },
      { id: "public-2", label: "Example 2", args: [[9, 9, 7, 8]], expected: 8 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [[-5, -2, -9]], expected: -5 },
      { id: "hidden-2", label: "Private test 2", args: [[6, 6, 6]], expected: null },
      { id: "hidden-3", label: "Private test 3", args: [[-1000000000]], expected: null },
    ],
  },
  "binary-search": {
    public: [
      { id: "public-1", label: "Target in middle", args: [[-4, 0, 3, 8, 12], 8], expected: 3 },
      { id: "public-2", label: "Target absent", args: [[1, 2, 5], 4], expected: -1 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [[], 2], expected: -1 },
      { id: "hidden-2", label: "Private test 2", args: [[-10, -3, 5], -10], expected: 0 },
      { id: "hidden-3", label: "Private test 3", args: [[1, 2, 5], 5], expected: 2 },
    ],
  },
  "sort-numbers": {
    public: [
      { id: "public-1", label: "Sort and keep duplicates", args: [[5, -1, 3, 3]], expected: [-1, 3, 3, 5] },
      { id: "public-2", label: "Sort empty list", args: [[]], expected: [] },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [[1]], expected: [1] },
      { id: "hidden-2", label: "Private test 2", args: [[0, -5, 4, -5]], expected: [-5, -5, 0, 4] },
    ],
  },
  "recursive-factorial": {
    public: [
      { id: "public-1", label: "Positive input", args: [5], expected: 120 },
      { id: "public-2", label: "Base case", args: [0], expected: 1 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [1], expected: 1 },
      { id: "hidden-2", label: "Private test 2", args: [8], expected: 40320 },
    ],
  },
  "character-frequency": {
    public: [
      { id: "public-1", label: "Repeated characters", args: ["banana"], expected: { b: 1, a: 3, n: 2 } },
      { id: "public-2", label: "Empty string", args: [""], expected: {} },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: ["Aa "], expected: { A: 1, a: 1, " ": 1 } },
      { id: "hidden-2", label: "Private test 2", args: ["!!!"], expected: { "!": 3 } },
    ],
  },
  "balanced-brackets": {
    public: [
      { id: "public-1", label: "Nested bracket pairs", args: ["{[()]}"], expected: true },
      { id: "public-2", label: "Wrong nesting order", args: ["([)]"], expected: false },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [""], expected: true },
      { id: "hidden-2", label: "Private test 2", args: ["(("], expected: false },
      { id: "hidden-3", label: "Private test 3", args: [")("], expected: false },
    ],
  },
  "queue-operations": {
    public: [
      { id: "public-1", label: "First-in, first-out", args: [[["enqueue", 4], ["enqueue", 7], ["dequeue"]]], expected: [4] },
      { id: "public-2", label: "Dequeue an empty queue", args: [[["dequeue"]]], expected: [null] },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [[]], expected: [] },
      { id: "hidden-2", label: "Private test 2", args: [[["enqueue", 2], ["dequeue"], ["dequeue"]]], expected: [2, null] },
    ],
  },
  "linked-list-cycle": {
    public: [
      { id: "public-1", label: "Cycle returns to head", args: [[1, 2, 0], 0], expected: true },
      { id: "public-2", label: "List ends at null pointer", args: [[1, -1], 0], expected: false },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [[], -1], expected: false },
      { id: "hidden-2", label: "Private test 2", args: [[-1], 0], expected: false },
      { id: "hidden-3", label: "Private test 3", args: [[1, 2, 3, 1], 0], expected: true },
    ],
  },
  "tree-depth": {
    public: [
      { id: "public-1", label: "Two-level tree", args: [{ value: 1, left: { value: 2, left: null, right: null }, right: { value: 3, left: null, right: null } }], expected: 2 },
      { id: "public-2", label: "Empty tree", args: [null], expected: 0 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [{ value: 9, left: null, right: null }], expected: 1 },
      { id: "hidden-2", label: "Private test 2", args: [{ value: 1, left: { value: 2, left: { value: 3, left: null, right: null }, right: null }, right: null }], expected: 3 },
    ],
  },
  "graph-reachability": {
    public: [
      { id: "public-1", label: "Connected nodes", args: [[[1], [0, 2], [1], []], 0, 2], expected: true },
      { id: "public-2", label: "Disconnected nodes", args: [[[1], [0], [3], [2]], 0, 3], expected: false },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [[[], []], 0, 0], expected: true },
      { id: "hidden-2", label: "Private test 2", args: [[[1, 2], [0, 2], [0, 1]], 2, 0], expected: true },
    ],
  },
  "fibonacci-dp": {
    public: [
      { id: "public-1", label: "Later sequence value", args: [7], expected: 13 },
      { id: "public-2", label: "First base case", args: [0], expected: 0 },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", args: [1], expected: 1 },
      { id: "hidden-2", label: "Private test 2", args: [10], expected: 55 },
    ],
  },
  "count-input-lines": {
    public: [
      { id: "public-1", label: "Two lines with final newline", stdin: "red\nblue\n", expectedStdout: "2\n" },
      { id: "public-2", label: "Empty input", stdin: "", expectedStdout: "0\n" },
    ],
    hidden: [
      { id: "hidden-1", label: "Private test 1", stdin: "single", expectedStdout: "1\n" },
      { id: "hidden-2", label: "Private test 2", stdin: "\n\n", expectedStdout: "2\n" },
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
