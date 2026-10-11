import { getMissionTestCases } from "@/lib/mission-tests";
import type { ExecutionMode, ExecutionResult } from "@/types";

const DEMO_NOTICE = "Sample demonstration — not executed against your code.";

/**
 * Builds a deliberately non-authoritative demonstration result.
 *
 * This function never inspects or executes learner source. It only uses the
 * public test labels so the UI can demonstrate its result layout without a
 * configured code-execution provider. Hidden tests are never included.
 */
export function createDemoExecutionResult(missionId: string, mode: ExecutionMode): ExecutionResult {
  const publicTests = getMissionTestCases(missionId, "run");

  return {
    status: "simulated",
    summary: DEMO_NOTICE,
    isMock: true,
    executionSource: "demo",
    isSimulated: true,
    simulationNotice: "These public sample cases are shown for demonstration only. Your Python code was not executed.",
    completedAt: new Date().toISOString(),
    tests: publicTests.map((testCase) => ({
      id: testCase.id,
      label: `${testCase.label} · sample only`,
      status: "simulated" as const,
    })),
    totalTests: publicTests.length,
    passedTests: 0,
    failedTests: publicTests.length,
    allPassed: false,
    mode,
    persistenceStatus: "unavailable",
  };
}
