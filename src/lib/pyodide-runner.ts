import type { PyodideAPI } from "pyodide";
import type { MissionExecutionContract, TestCaseResult } from "@/types";
import type { ServerTestCase } from "@/lib/mission-tests";

export type PublicPythonTestCase = ServerTestCase;

export interface LocalPythonTestResult {
  tests: TestCaseResult[];
  passedTests: number;
  failedTests: number;
  allPassed: boolean;
}

const MAX_CAPTURED_OUTPUT = 32_768;
const MAX_TRACEBACK_LENGTH = 12_000;

const TEST_HARNESS = `
import contextlib as __cq_contextlib
import io as __cq_io
import json as __cq_json
import traceback as __cq_traceback

def __cq_run():
    class __cq_LimitedWriter:
        def __init__(self):
            self.parts = []
            self.size = 0
            self.truncated = False
        def write(self, text):
            available = ${MAX_CAPTURED_OUTPUT} - self.size
            if available > 0:
                kept = text[:available]
                self.parts.append(kept)
                self.size += len(kept)
            if len(text) > available:
                self.truncated = True
            return len(text)
        def flush(self):
            pass
        def getvalue(self):
            value = "".join(self.parts)
            return value + ("\\\\n[output truncated]" if self.truncated else "")

    __cq_out = __cq_LimitedWriter()
    __cq_err = __cq_LimitedWriter()
    __cq_namespace = {"__builtins__": dict(__import__("builtins").__dict__)}
    __cq_result = {"ok": False}
    try:
        if __cq_execution_kind == "stdin_stdout":
            import sys as __cq_sys
            __cq_original_stdin = __cq_sys.stdin
            try:
                __cq_sys.stdin = __cq_io.StringIO(__cq_stdin_text)
                with __cq_contextlib.redirect_stdout(__cq_out), __cq_contextlib.redirect_stderr(__cq_err):
                    exec(compile(__cq_source, "<learner-code>", "exec"), __cq_namespace, __cq_namespace)
                __cq_result = {"ok": True, "value": None}
            finally:
                __cq_sys.stdin = __cq_original_stdin
        else:
            with __cq_contextlib.redirect_stdout(__cq_out), __cq_contextlib.redirect_stderr(__cq_err):
                exec(compile(__cq_source, "<learner-code>", "exec"), __cq_namespace, __cq_namespace)
                __cq_function = __cq_namespace.get(__cq_function_name)
                if not callable(__cq_function):
                    raise NameError("Required function '" + __cq_function_name + "' was not found")
                __cq_value = __cq_function(*__cq_json.loads(__cq_args_json))
                __cq_result = {"ok": True, "value": __cq_value}
    except BaseException as __cq_exception:
        __cq_result = {
            "ok": False,
            "errorType": type(__cq_exception).__name__,
            "traceback": __cq_traceback.format_exc(),
        }

    try:
        __cq_encoded = __cq_json.dumps({
            "result": __cq_result,
            "stdout": __cq_out.getvalue(),
            "stderr": __cq_err.getvalue(),
        }, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        if len(__cq_encoded) > ${MAX_CAPTURED_OUTPUT * 2}:
            raise ValueError("The Python result exceeded the allowed output size")
        return __cq_encoded
    except BaseException as __cq_exception:
        return __cq_json.dumps({
            "result": {
                "ok": False,
                "errorType": type(__cq_exception).__name__,
                "traceback": __cq_traceback.format_exc(),
            },
            "stdout": __cq_out.getvalue(),
            "stderr": __cq_err.getvalue(),
        }, ensure_ascii=False, separators=(",", ":"))

__cq_run()
`;

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(leftRecord[key], rightRecord[key]));
  }
  return false;
}

function outputString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function runCase(
  pyodide: PyodideAPI,
  sourceCode: string,
  execution: MissionExecutionContract,
  testCase: PublicPythonTestCase,
): Promise<TestCaseResult> {
  const startedAt = performance.now();
  pyodide.globals.set("__cq_source", sourceCode);
  pyodide.globals.set("__cq_execution_kind", execution.kind);
  if (execution.kind === "function") {
    if (!("args" in testCase)) throw new Error("The public function test case is invalid.");
    pyodide.globals.set("__cq_function_name", execution.functionName);
    pyodide.globals.set("__cq_args_json", JSON.stringify(testCase.args));
  } else {
    if (!("stdin" in testCase)) throw new Error("The public stdin/stdout test case is invalid.");
    pyodide.globals.set("__cq_stdin_text", testCase.stdin);
  }

  let rawResult: unknown;
  try {
    rawResult = await pyodide.runPythonAsync(TEST_HARNESS, { filename: "<codequest-harness>" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Python runtime failed unexpectedly.";
    throw new Error(`Python runtime error: ${message}`);
  }

  let payloadText: string;
  try {
    payloadText = typeof rawResult === "string" ? rawResult : String(rawResult);
  } finally {
    if (isRecord(rawResult) && typeof rawResult.destroy === "function") rawResult.destroy();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadText) as unknown;
  } catch {
    throw new Error("The Python runtime returned an unreadable result. Retry or use Live Judge0 if it is configured.");
  }
  if (!isRecord(payload) || !isRecord(payload.result)) {
    throw new Error("The Python runtime returned an invalid result. Retry or use Live Judge0 if it is configured.");
  }

  const result = payload.result;
  const stdout = typeof payload.stdout === "string" ? payload.stdout : "";
  const stderr = typeof payload.stderr === "string" ? payload.stderr : "";
  const durationMs = Math.round(performance.now() - startedAt);
  const shared = { id: testCase.id, label: testCase.label, durationMs };

  if (result.ok !== true) {
    const errorType = typeof result.errorType === "string" ? result.errorType : "PythonError";
    const traceback = typeof result.traceback === "string"
      ? result.traceback.slice(-MAX_TRACEBACK_LENGTH)
      : "Python raised an exception, but no traceback was returned.";
    const status = errorType === "SyntaxError" || errorType === "IndentationError"
      ? "compilation_error"
      : "runtime_error";
    return {
      ...shared,
      status,
      ...(stdout ? { stdout } : {}),
      stderr: [stderr, traceback].filter(Boolean).join("\n"),
      errorMessage: `${errorType}: ${traceback.split("\n").filter(Boolean).at(-1) ?? "Python execution failed."}`,
    };
  }

  const isStdioTest = "stdin" in testCase;
  const actualOutput = isStdioTest ? stdout : result.value;
  const expectedOutput = isStdioTest ? testCase.expectedStdout : testCase.expected;
  const passed = valuesEqual(actualOutput, expectedOutput);
  return {
    ...shared,
    status: passed ? "passed" : "failed",
    expectedOutput: outputString(expectedOutput),
    actualOutput: outputString(actualOutput),
    ...(stdout ? { stdout } : {}),
    ...(stderr ? { stderr } : {}),
    ...(!passed
      ? { errorMessage: isStdioTest ? "The program's output did not match the expected output." : "The returned value did not match the expected result." }
      : {}),
  };
}

export async function executePublicPythonTests(
  pyodide: PyodideAPI,
  sourceCode: string,
  execution: MissionExecutionContract,
  testCases: PublicPythonTestCase[],
): Promise<LocalPythonTestResult> {
  const tests: TestCaseResult[] = [];
  for (const testCase of testCases) {
    tests.push(await runCase(pyodide, sourceCode, execution, testCase));
  }
  const passedTests = tests.filter((test) => test.status === "passed").length;
  const failedTests = tests.length - passedTests;
  return {
    tests,
    passedTests,
    failedTests,
    allPassed: tests.length > 0 && passedTests === tests.length,
  };
}
