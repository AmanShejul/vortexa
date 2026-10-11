import type { Mission } from "@/types";
import type { JsonValue, ServerTestCase } from "@/lib/mission-tests";

export const HARNESS_MARKER = "__CODEQUEST_RESULT__";

function jsonLiteral(value: JsonValue): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Test data is not JSON serializable.");
  return serialized;
}

function validateArgument(value: JsonValue, type: string): boolean {
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "string") return typeof value === "string";
  if (type === "integer[]") {
    return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isInteger(item));
  }
  if (type === "integer[][]") {
    return Array.isArray(value) && value.every(
      (items) => Array.isArray(items) && items.every((item) => typeof item === "number" && Number.isInteger(item)),
    );
  }
  if (type === "json") return true;
  return false;
}

function isFunctionTestCase(testCase: ServerTestCase): testCase is Extract<ServerTestCase, { args: JsonValue[] }> {
  return "args" in testCase;
}

export function validateTestCase(mission: Mission, testCase: ServerTestCase): void {
  const execution = mission.execution;
  if (execution.kind === "stdin_stdout") {
    if (!("stdin" in testCase) || typeof testCase.stdin !== "string" || typeof testCase.expectedStdout !== "string") {
      throw new Error(`Invalid stdin/stdout test definition for mission: ${mission.id}`);
    }
    return;
  }
  if (!isFunctionTestCase(testCase)) {
    throw new Error(`Invalid function test definition for mission: ${mission.id}`);
  }
  if (testCase.args.length !== execution.parameters.length) {
    throw new Error(`Invalid test definition for mission: ${mission.id}`);
  }
  testCase.args.forEach((value, index) => {
    if (!validateArgument(value, execution.parameters[index].type)) {
      throw new Error(`Invalid test argument for mission: ${mission.id}`);
    }
  });
}

export function buildPythonHarness(mission: Mission, testCase: ServerTestCase, userCode: string): string {
  validateTestCase(mission, testCase);
  const source = userCode.replace(/\r\n/g, "\n").trimEnd();
  const marker = jsonLiteral(HARNESS_MARKER);

  if (mission.execution.kind === "stdin_stdout") {
    if (!("stdin" in testCase)) throw new Error(`Invalid stdin/stdout test definition for mission: ${mission.id}`);
    return `
import io as __cq_io
import json as __cq_json
import sys as __cq_sys

__cq_marker = ${marker}
__cq_original_stdin = __cq_sys.stdin
__cq_original_stdout = __cq_sys.stdout
__cq_input = ${jsonLiteral(testCase.stdin)}
__cq_output = __cq_io.StringIO()
__cq_namespace = {"__name__": "__main__"}

try:
    __cq_sys.stdin = __cq_io.StringIO(__cq_input)
    __cq_sys.stdout = __cq_output
    exec(compile(${jsonLiteral(source)}, "<learner-code>", "exec"), __cq_namespace, __cq_namespace)
    __cq_payload = {"ok": True, "stdout": __cq_output.getvalue()[:65536]}
except BaseException as __cq_error:
    __cq_payload = {
        "ok": False,
        "errorType": type(__cq_error).__name__,
        "errorMessage": str(__cq_error)[:2000],
    }
finally:
    __cq_sys.stdin = __cq_original_stdin
    __cq_sys.stdout = __cq_original_stdout

print(__cq_marker + __cq_json.dumps(__cq_payload, ensure_ascii=False, separators=(",", ":")))
`;
  }

  if (mission.execution.kind !== "function" || !isFunctionTestCase(testCase)) {
    throw new Error(`Invalid function test definition for mission: ${mission.id}`);
  }
  const functionName = jsonLiteral(mission.execution.functionName);
  const args = jsonLiteral(testCase.args);

  return `${source}

import contextlib as __cq_contextlib
import io as __cq_io
import json as __cq_json
import time as __cq_time

__cq_marker = ${jsonLiteral(HARNESS_MARKER)}
__cq_function_name = ${functionName}
__cq_args = ${args}

try:
    __cq_function = globals().get(__cq_function_name)
    if not callable(__cq_function):
        raise NameError(f"Required function '{__cq_function_name}' was not found")
    __cq_printed = __cq_io.StringIO()
    __cq_started = __cq_time.perf_counter()
    with __cq_contextlib.redirect_stdout(__cq_printed):
        __cq_value = __cq_function(*__cq_args)
    __cq_duration = round((__cq_time.perf_counter() - __cq_started) * 1000)
    __cq_payload = {
        "ok": True,
        "value": __cq_value,
        "stdout": __cq_printed.getvalue()[:65536],
        "durationMs": __cq_duration,
    }
    __cq_json_text = __cq_json.dumps(__cq_payload, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
except BaseException as __cq_error:
    __cq_payload = {
        "ok": False,
        "errorType": type(__cq_error).__name__,
        "errorMessage": str(__cq_error)[:2000],
    }
    __cq_json_text = __cq_json.dumps(__cq_payload, ensure_ascii=False, separators=(",", ":"))

print(__cq_marker + __cq_json_text)
`;
}

export interface HarnessResult {
  ok: boolean;
  value?: JsonValue;
  stdout?: string;
  actualStdout?: string;
  durationMs?: number;
  errorType?: string;
  errorMessage?: string;
}

export function parseHarnessOutput(stdout: string): HarnessResult | null {
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.startsWith(HARNESS_MARKER));
  if (!line) return null;

  try {
    const parsed: unknown = JSON.parse(line.slice(HARNESS_MARKER.length));
    if (!parsed || typeof parsed !== "object" || typeof (parsed as { ok?: unknown }).ok !== "boolean") return null;
    const result = parsed as HarnessResult;
    if (result.ok && "stdout" in result) result.actualStdout = result.stdout;
    return result;
  } catch {
    return null;
  }
}
