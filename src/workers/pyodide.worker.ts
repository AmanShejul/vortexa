import { loadPyodide } from "pyodide";
import { executePublicPythonTests, type PublicPythonTestCase } from "@/lib/pyodide-runner";
import type { MissionExecutionContract } from "@/types";

const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.29.5/full/";

interface WorkerRequest {
  requestId: number;
  sourceCode: string;
  execution: MissionExecutionContract;
  testCases: PublicPythonTestCase[];
}

let pyodidePromise: ReturnType<typeof loadPyodide> | undefined;

function getPyodide() {
  pyodidePromise ??= loadPyodide({
    indexURL: PYODIDE_INDEX_URL,
    jsglobals: Object.create(null) as object,
    stdout: () => undefined,
    stderr: () => undefined,
  });
  return pyodidePromise;
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  let runtimeReady = false;
  try {
    const pyodide = await getPyodide();
    runtimeReady = true;
    self.postMessage({ type: "ready", requestId: request.requestId });
    const result = await executePublicPythonTests(
      pyodide,
      request.sourceCode,
      request.execution,
      request.testCases,
    );
    self.postMessage({ type: "result", requestId: request.requestId, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Python runtime error.";
    self.postMessage({ type: "error", requestId: request.requestId, message, runtimeReady });
  }
});
