// Canonical local mentor engine used by the server-side /api/hint route.
// It is deterministic, evidence-based, and makes no external AI requests.

const MAX_TEXT = 4000;

const trimText = (value) => typeof value === "string" ? value.slice(0, MAX_TEXT) : "";
const isFailed = (test) => test && test.status !== "passed";

export function classifyMistake(userCode, executionResult) {
  if (executionResult?.status === "passed" && executionResult?.allPassed) return "PASSED";
  if (executionResult?.status === "compilation_error") return "SYNTAX_OR_RUNTIME";
  if (executionResult?.status === "runtime_error") return "SYNTAX_OR_RUNTIME";
  if (executionResult?.status === "time_limit_exceeded") return "SYNTAX_OR_RUNTIME";
  if (executionResult?.status === "execution_error") return "UNKNOWN_ERROR";

  const failedTests = Array.isArray(executionResult?.tests)
    ? executionResult.tests.filter(isFailed)
    : [];
  const publicFailure = failedTests.find((test) => String(test.id).startsWith("public-"));

  if (publicFailure?.expectedOutput && publicFailure?.actualOutput) {
    try {
      const expected = JSON.parse(publicFailure.expectedOutput);
      const actual = JSON.parse(publicFailure.actualOutput);
      if (typeof expected !== typeof actual) return "OUTPUT_FORMAT_MISMATCH";
    } catch {
      return "OUTPUT_FORMAT_MISMATCH";
    }
  }

  if (/range\s*\(\s*len\s*\(/.test(userCode) && /<=|\+\s*1/.test(userCode)) {
    return "OFF_BY_ONE";
  }

  if (failedTests.length > 0 || executionResult?.status === "wrong_answer") {
    return "INCORRECT_LOGIC";
  }

  return "UNKNOWN_ERROR";
}

export function generateProgressiveHints(category, executionResult) {
  switch (category) {
    case "PASSED":
      return {
        explanation: "Your implementation passed the executed mission tests.",
        level1: "Great work. You matched the mission contract on the tests that ran.",
        level2: "You used the function's inputs and return value correctly.",
        level3: "Before moving on, consider why the edge cases in this mission are covered."
      };
    case "SYNTAX_OR_RUNTIME":
      return {
        explanation: executionResult?.status === "time_limit_exceeded"
          ? "The function did not finish within the execution limit. This is an execution problem, not a wrong-answer result."
          : executionResult?.status === "compilation_error"
            ? "Judge0 could not compile or parse the submitted Python source."
            : "The function raised an exception while Judge0 was executing it.",
        level1: "Read the execution error first and locate the line or operation it names.",
        level2: "Check the function's inputs, return path, and any operation that can fail for edge-case values.",
        level3: executionResult?.status === "time_limit_exceeded"
          ? "Trace every loop and make sure each loop moves toward a terminating condition."
          : "Fix the reported syntax or runtime issue, then run the public examples again."
      };
    case "OUTPUT_FORMAT_MISMATCH":
      return {
        explanation: "The function returned a value with a different shape or type than the mission contract requires.",
        level1: "Check the required return type in the mission statement.",
        level2: "Compare the value returned by your function with the visible expected value, including its type.",
        level3: "Return the computed value directly in the required type; do not print a replacement value."
      };
    case "OFF_BY_ONE":
      return {
        explanation: "The result suggests a boundary calculation may include one item too many or too few.",
        level1: "Trace the first and last values processed by your loop.",
        level2: "Check whether the endpoint is inclusive or exclusive and how Python's range boundaries work.",
        level3: "Adjust the loop boundary so every required item is visited exactly once."
      };
    case "INCORRECT_LOGIC":
      return {
        explanation: "The code executed, but at least one returned value did not match the mission contract.",
        level1: "Walk through one failing public example by hand, one statement at a time.",
        level2: "Compare the intermediate values your function computes with the definition of the mission.",
        level3: "Re-check edge cases such as zero, negative values, empty inputs, duplicates, and single-item inputs."
      };
    default:
      return {
        explanation: "The execution result does not provide enough trustworthy evidence to identify a learner mistake.",
        level1: "Run the code again and inspect the complete execution result.",
        level2: "Confirm that the required function name, parameters, and return type match the mission.",
        level3: "If the service continues to fail, retry later or report the execution error rather than changing correct code blindly."
      };
  }
}

export function generateMissionRelevantHints(category, executionResult, mission) {
  const guidance = generateProgressiveHints(category, executionResult);
  const focusAreas = Array.isArray(mission?.hintMetadata?.focusAreas)
    ? mission.hintMetadata.focusAreas.filter((item) => typeof item === "string" && item.length > 0)
    : [];
  const focus = focusAreas[0] || mission?.topic || "the mission contract";
  const title = typeof mission?.title === "string" ? mission.title : "this mission";

  return {
    ...guidance,
    explanation: `${guidance.explanation} Mission focus: ${focus}.`,
    level1: `${guidance.level1} For ${title}, focus on ${focus}.`,
    level2: `${guidance.level2} Keep the ${focus} requirement in view as you trace the example.`,
    level3: `${guidance.level3} Recheck the mission's public edge cases against the ${focus} requirement.`,
  };
}

// Safe guidance path for mission-level advice. It is intentionally not tied
// to learner code or fabricated execution evidence.
export function generateGeneralMissionHints(mission, hintLevel = 1) {
  const safeLevel = Math.min(3, Math.max(1, Number(hintLevel) || 1));
  const functionName = mission?.execution?.kind === "function"
    && typeof mission.execution.functionName === "string"
    ? mission.execution.functionName
    : "the program's input/output contract";
  const title = typeof mission?.title === "string" ? mission.title : "this mission";
  const focus = typeof mission?.topic === "string" ? mission.topic : "the mission rule";
  const hints = [
    `Start by restating the input and output rule for ${title}. Keep the work inside ${functionName} and focus on ${focus}.`,
    `Trace the input through the ${focus} rule. Check the condition, loop boundary, data structure, or output formatting that carries the result.`,
    `Compare your planned steps with each visible example, then check the smallest, empty, or boundary case described in the constraints. Correct the first step where your reasoning diverges.`,
  ];

  return {
    explanation: `General mission guidance for ${title}. It is not a diagnosis based on a server execution result.`,
    level1: hints[0],
    level2: hints[1],
    level3: hints[2],
    requestedLevel: safeLevel,
  };
}

export function processSubmissionAI(userCode, executionResult, mission, hintLevel = 1) {
  const safeLevel = Math.min(3, Math.max(1, Number(hintLevel) || 1));
  const category = classifyMistake(userCode, executionResult);
  const hints = generateProgressiveHints(category, executionResult);
  const hintKeys = ["level1", "level2", "level3"];

  return {
    category,
    explanation: trimText(hints.explanation),
    hint: trimText(hints[hintKeys[safeLevel - 1]]),
    hintLevel: safeLevel,
    isFallback: true
  };
}
