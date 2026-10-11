import type { ExecutionMode, ExecutionResult } from "@/types";

const CLIENT_TIMEOUT_MS = 35_000;

interface ErrorResponse {
  error?: {
    message?: string;
  };
}

export async function executeMission(
  missionId: string,
  sourceCode: string,
  mode: ExecutionMode,
): Promise<ExecutionResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ missionId, sourceCode, language: "python", mode }),
      signal: controller.signal,
    });

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const errorResponse = payload as ErrorResponse | null;
      throw new Error(errorResponse?.error?.message ?? "The execution request failed.");
    }
    if (!payload || typeof payload !== "object" || !("status" in payload)) {
      throw new Error("The execution service returned an invalid response.");
    }
    return payload as ExecutionResult;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The execution request timed out. Please try again.");
    }
    throw error instanceof Error ? error : new Error("The execution request failed.");
  } finally {
    window.clearTimeout(timeout);
  }
}
