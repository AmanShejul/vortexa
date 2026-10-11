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
  return false;
}

export function validateTestCase(mission: Mission, testCase: ServerTestCase): void {
  if (testCase.args.length !== mission.execution.parameters.length) {
    throw new Error(`Invalid test definition for mission: ${mission.id}`);
  }
  testCase.args.forEach((value, index) => {
    if (!validateArgument(value, mission.execution.parameters[index].type)) {
      throw new Error(`Invalid test argument for mission: ${mission.id}`);
    }
  });
}

export function buildPythonHarness(mission: Mission, testCase: ServerTestCase, userCode: string): string {
  validateTestCase(mission, testCase);
  const functionName = jsonLiteral(mission.execution.functionName);
  const args = jsonLiteral(testCase.args);
  const source = userCode.replace(/\r\n/g, "\n").trimEnd();

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
    return parsed as HarnessResult;
  } catch {
    return null;
  }
}
