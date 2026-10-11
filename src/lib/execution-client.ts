import { getMission } from "@/lib/missions";
import type { ExecutionMode, ExecutionResult } from "@/types";

/** Demo-only execution seam. It never evaluates submitted code. */
export async function executeMockMission(missionId: string, _code: string, mode: ExecutionMode): Promise<ExecutionResult> {
  await new Promise((resolve) => window.setTimeout(resolve, mode === "submit" ? 900 : 650));
  const mission = getMission(missionId);
  const testCount = mission?.examples.length ?? 2;
  return {
    status: "passed",
    summary: mode === "submit" ? "Demo submission passed visible checks." : "Demo run completed successfully.",
    isMock: true,
    completedAt: new Date().toISOString(),
    tests: Array.from({ length: testCount }, (_, index) => ({ id: `${missionId}-test-${index + 1}`, label: `Visible test ${index + 1}`, status: "passed" as const, durationMs: 12 + index * 7 })),
  };
}
