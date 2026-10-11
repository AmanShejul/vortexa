import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

interface PyodideRunnerSmokeResults {
  outputAndLoops: {
    allPassed: boolean;
    tests: Array<{ status: string; expectedOutput?: string; actualOutput?: string; stdout?: string }>;
  };
  syntax: { allPassed: boolean; tests: Array<{ status: string; stderr?: string }> };
  runtime: { allPassed: boolean; tests: Array<{ status: string; stderr?: string }> };
}

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
  "calculate_total",
  [{ id: "public-1", label: "Public example", args: [[2, 3, 5]], expected: 10 }],
);
const syntax = await executePublicPythonTests(
  pyodide,
  "def broken(:\\n    return 1",
  "broken",
  [{ id: "public-1", label: "Public example", args: [], expected: 1 }],
);
const runtime = await executePublicPythonTests(
  pyodide,
  "def fail(value):\\n    return value / 0",
  "fail",
  [{ id: "public-1", label: "Public example", args: [2], expected: 1 }],
);
console.log(JSON.stringify({ outputAndLoops, syntax, runtime }));
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
});
