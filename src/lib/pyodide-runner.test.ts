import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { missions } from "@/lib/missions";
import { getMissionTestCases } from "@/lib/mission-tests";

interface PyodideRunnerSmokeResults {
  outputAndLoops: {
    allPassed: boolean;
    tests: Array<{ status: string; expectedOutput?: string; actualOutput?: string; stdout?: string }>;
  };
  syntax: { allPassed: boolean; tests: Array<{ status: string; stderr?: string }> };
  runtime: { allPassed: boolean; tests: Array<{ status: string; stderr?: string }> };
  additionalMissions: Array<{ allPassed: boolean; tests: Array<{ status: string }> }>;
  stdinStdout: { allPassed: boolean; tests: Array<{ status: string; expectedOutput?: string; actualOutput?: string }> };
  canonicalMissions: Array<{ id: string; allPassed: boolean; tests: Array<{ status: string }> }>;
}

const missionSolutions: Record<string, string> = {
  "sum-of-two-numbers": `def sum_two_numbers(a, b):
    return a + b`,
  "even-or-odd": `def even_or_odd(number):
    return 'Even' if number % 2 == 0 else 'Odd'`,
  "sum-from-one-to-n": `def sum_to_n(n):
    return sum(range(1, n + 1))`,
  "find-largest-number": `def find_largest(numbers):
    return max(numbers)`,
  "count-vowels": `def count_vowels(text):
    return sum(char.lower() in 'aeiou' for char in text)`,
  "two-sum": `def has_two_sum(nums, target):
    seen = set()
    for value in nums:
        if target - value in seen: return True
        seen.add(value)
    return False`,
  "second-largest-number": `def second_largest(numbers):
    values = sorted(set(numbers))
    return values[-2] if len(values) > 1 else None`,
  "binary-search": `def binary_search(numbers, target):
    low, high = 0, len(numbers) - 1
    while low <= high:
        mid = (low + high) // 2
        if numbers[mid] == target: return mid
        if numbers[mid] < target: low = mid + 1
        else: high = mid - 1
    return -1`,
  "sort-numbers": `def sort_numbers(numbers):
    return sorted(numbers)`,
  "recursive-factorial": `def factorial(n):
    return 1 if n == 0 else n * factorial(n - 1)`,
  "character-frequency": `def character_frequency(text):
    counts = {}
    for char in text: counts[char] = counts.get(char, 0) + 1
    return counts`,
  "balanced-brackets": `def is_balanced(text):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for char in text:
        if char in '([{': stack.append(char)
        elif not stack or stack.pop() != pairs[char]: return False
    return not stack`,
  "queue-operations": `def process_queue(operations):
    queue, output = [], []
    for operation in operations:
        if operation[0] == 'enqueue': queue.append(operation[1])
        else: output.append(queue.pop(0) if queue else None)
    return output`,
  "linked-list-cycle": `def has_cycle(next_indices, head):
    seen = set()
    while head != -1:
        if head in seen: return True
        seen.add(head)
        head = next_indices[head]
    return False`,
  "tree-depth": `def max_depth(root):
    if root is None: return 0
    return 1 + max(max_depth(root.get('left')), max_depth(root.get('right')))`,
  "graph-reachability": `def can_reach(graph, start, target):
    seen, queue = {start}, [start]
    while queue:
        node = queue.pop(0)
        if node == target: return True
        for neighbor in graph[node]:
            if neighbor not in seen: seen.add(neighbor); queue.append(neighbor)
    return False`,
  "fibonacci-dp": `def fibonacci(n):
    previous, current = 0, 1
    for _ in range(n): previous, current = current, previous + current
    return previous`,
  "count-input-lines": `import sys
print(len(sys.stdin.read().splitlines()))`,
};

const canonicalMissionCases = missions.map((mission) => ({
  id: mission.id,
  sourceCode: missionSolutions[mission.id] ?? "",
  execution: mission.execution,
  tests: getMissionTestCases(mission.id, "run"),
}));

const smokeScript = `
import { loadPyodide } from "pyodide";

const { executePublicPythonTests } = await import("data:text/javascript;base64,${Buffer.from(
  ts.transpileModule(
    readFileSync(resolve(process.cwd(), "src/lib/pyodide-runner.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText,
).toString("base64")}");
const pyodide = await loadPyodide({ stdout: () => undefined, stderr: () => undefined });
const outputAndLoops = await executePublicPythonTests(
  pyodide,
  [
    "def calculate_total(values):",
    "    total = 0",
    "    for value in values:",
    "        total += value",
    "    print('calculated', total)",
    "    return total",
  ].join("\\n"),
  { kind: "function", functionName: "calculate_total", parameters: [{ name: "values", type: "integer[]" }], returnType: "integer" },
  [{ id: "public-1", label: "Public example", args: [[2, 3, 5]], expected: 10 }],
);
const syntax = await executePublicPythonTests(
  pyodide,
  "def broken(:\\n    return 1",
  { kind: "function", functionName: "broken", parameters: [], returnType: "integer" },
  [{ id: "public-1", label: "Public example", args: [], expected: 1 }],
);
const runtime = await executePublicPythonTests(
  pyodide,
  "def fail(value):\\n    return value / 0",
  { kind: "function", functionName: "fail", parameters: [{ name: "value", type: "integer" }], returnType: "integer" },
  [{ id: "public-1", label: "Public example", args: [2], expected: 1 }],
);
const additionalMissions = [];
for (const mission of [
  {
    code: "def factorial(n):\\n    if n == 0: return 1\\n    return n * factorial(n - 1)",
    execution: { kind: "function", functionName: "factorial" },
    args: [5],
    expected: 120,
  },
  {
    code: "def character_frequency(text):\\n    counts = {}\\n    for char in text: counts[char] = counts.get(char, 0) + 1\\n    return counts",
    execution: { kind: "function", functionName: "character_frequency" },
    args: ["aba"],
    expected: { a: 2, b: 1 },
  },
  {
    code: "def is_balanced(text):\\n    pairs = {')': '(', ']': '[', '}': '{'}\\n    stack = []\\n    for char in text:\\n        if char in '([{': stack.append(char)\\n        elif not stack or stack.pop() != pairs[char]: return False\\n    return not stack",
    execution: { kind: "function", functionName: "is_balanced" },
    args: ["([])"],
    expected: true,
  },
  {
    code: "from collections import deque\\ndef can_reach(graph, start, target):\\n    queue = deque([start])\\n    seen = {start}\\n    while queue:\\n        node = queue.popleft()\\n        if node == target: return True\\n        for neighbor in graph[node]:\\n            if neighbor not in seen: seen.add(neighbor); queue.append(neighbor)\\n    return False",
    execution: { kind: "function", functionName: "can_reach" },
    args: [[[1], [0, 2], [1]], 0, 2],
    expected: true,
  },
  {
    code: "def fibonacci(n):\\n    previous, current = 0, 1\\n    for _ in range(n): previous, current = current, previous + current\\n    return previous",
    execution: { kind: "function", functionName: "fibonacci" },
    args: [10],
    expected: 55,
  },
]) {
  additionalMissions.push(await executePublicPythonTests(
    pyodide,
    mission.code,
    { ...mission.execution, parameters: [], returnType: "object" },
    [{ id: "public-1", label: "Public example", args: mission.args, expected: mission.expected }],
  ));
}
const stdinStdout = await executePublicPythonTests(
  pyodide,
  "import sys\\ntext = sys.stdin.read()\\nprint(len(text.splitlines()))",
  { kind: "stdin_stdout" },
  [{ id: "public-1", label: "Public input", stdin: "red\\nblue\\n", expectedStdout: "2\\n" }],
);
const canonicalMissions = [];
for (const mission of ${JSON.stringify(canonicalMissionCases)}) {
  const result = await executePublicPythonTests(pyodide, mission.sourceCode, mission.execution, mission.tests);
  canonicalMissions.push({ id: mission.id, allPassed: result.allPassed, tests: result.tests });
}
console.log(JSON.stringify({ outputAndLoops, syntax, runtime, additionalMissions, stdinStdout, canonicalMissions }));
pyodide.globals.destroy();
`;

let smokeResults: PyodideRunnerSmokeResults | undefined;

function getSmokeResults() {
  smokeResults ??= JSON.parse(execFileSync(
    process.execPath,
    ["--input-type=module", "-e", smokeScript],
    { cwd: process.cwd(), encoding: "utf8", timeout: 120_000 },
  )) as PyodideRunnerSmokeResults;
  return smokeResults;
}

describe("real Pyodide public-test execution", () => {
  it("executes arithmetic, variables, loops and captures standard output", () => {
    const result = getSmokeResults().outputAndLoops;

    expect(result.allPassed).toBe(true);
    expect(result.tests[0]).toMatchObject({
      status: "passed",
      expectedOutput: "10",
      actualOutput: "10",
      stdout: "calculated 10\n",
    });
  });

  it("returns a Python syntax traceback without reporting a pass", () => {
    const result = getSmokeResults().syntax;

    expect(result.allPassed).toBe(false);
    expect(result.tests[0].status).toBe("compilation_error");
    expect(result.tests[0].stderr).toContain("SyntaxError");
    expect(result.tests[0].stderr).toContain("<learner-code>");
  });

  it("returns a Python runtime traceback for learner exceptions", () => {
    const result = getSmokeResults().runtime;

    expect(result.allPassed).toBe(false);
    expect(result.tests[0].status).toBe("runtime_error");
    expect(result.tests[0].stderr).toContain("ZeroDivisionError");
    expect(result.tests[0].stderr).toContain("<learner-code>");
  });

  it("executes recursive, dictionary, stack, graph and dynamic-programming missions", () => {
    const results = getSmokeResults().additionalMissions;
    expect(results).toHaveLength(5);
    expect(results.every((result) => result.allPassed && result.tests[0].status === "passed")).toBe(true);
  });

  it("executes stdin/stdout missions and compares the actual printed output", () => {
    const result = getSmokeResults().stdinStdout;
    expect(result.allPassed).toBe(true);
    expect(result.tests[0]).toMatchObject({
      status: "passed",
      expectedOutput: "2\n",
      actualOutput: "2\n",
    });
  });

  it("passes all authored public cases through the shared mission evaluator", () => {
    const results = getSmokeResults().canonicalMissions;
    expect(results).toHaveLength(missions.length);
    expect(results.filter((result) => !result.allPassed || result.tests.some((test) => test.status !== "passed"))).toEqual([]);
  });
});
