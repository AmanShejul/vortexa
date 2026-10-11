import type { LocalPythonTestResult, PublicPythonTestCase } from "@/lib/pyodide-runner";
import type { MissionExecutionContract } from "@/types";

export const LOCAL_PYTHON_EXECUTION_TIMEOUT_MS = Math.min(
  30_000,
  Math.max(1_000, Number(process.env.NEXT_PUBLIC_LOCAL_PYTHON_TIMEOUT_MS) || 10_000),
);

const PYTHON_RUNTIME_LOAD_TIMEOUT_MS = 90_000;

export type LocalPythonPhase = "loading" | "running";
export type LocalPythonWorkerFactory = () => Worker;

interface PendingRequest {
  requestId: number;
  onStatus?: (phase: LocalPythonPhase) => void;
  resolve: (result: LocalPythonTestResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  ready: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLocalPythonTestResult(value: unknown): value is LocalPythonTestResult {
  if (!isRecord(value)
    || !Array.isArray(value.tests)
    || !Number.isInteger(value.passedTests)
    || !Number.isInteger(value.failedTests)
    || typeof value.allPassed !== "boolean") {
    return false;
  }
  return value.tests.every((test) =>
    isRecord(test)
    && typeof test.id === "string"
    && typeof test.label === "string"
    && ["passed", "failed", "compilation_error", "runtime_error"].includes(String(test.status)));
}

export class LocalPythonWorkerClient {
  private worker: Worker | null = null;
  private pending: PendingRequest | null = null;
  private nextRequestId = 1;

  constructor(
    private readonly createWorker: LocalPythonWorkerFactory = () =>
      new Worker(new URL("../workers/pyodide.worker.ts", import.meta.url), { type: "module" }),
    private readonly executionTimeoutMs = LOCAL_PYTHON_EXECUTION_TIMEOUT_MS,
    private readonly runtimeLoadTimeoutMs = PYTHON_RUNTIME_LOAD_TIMEOUT_MS,
  ) {}

  execute(
    sourceCode: string,
    execution: MissionExecutionContract,
    testCases: PublicPythonTestCase[],
    onStatus?: (phase: LocalPythonPhase) => void,
  ): Promise<LocalPythonTestResult> {
    if (this.pending) return Promise.reject(new Error("A local Python run is already in progress."));

    let worker: Worker;
    try {
      worker = this.worker ?? this.createWorker();
      this.worker = worker;
    } catch {
      return Promise.reject(new Error("This browser could not start a Python worker. Retry or use Live Judge0 if it is configured."));
    }

    const requestId = this.nextRequestId++;
    onStatus?.("loading");

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(
          requestId,
          new Error(
            this.pending?.ready
              ? `Local Python execution timed out after ${this.executionTimeoutMs / 1000} seconds. The worker was restarted; retry or use Live Judge0 if it is configured.`
              : "The Python runtime took too long to load. Check your network connection, retry, or use Live Judge0 if it is configured.",
          ),
        );
      }, this.runtimeLoadTimeoutMs);

      this.pending = { requestId, onStatus, resolve, reject, timer, ready: false };
      worker.onmessage = (event: MessageEvent<unknown>) => this.handleMessage(requestId, event.data);
      worker.onerror = () => {
        this.fail(requestId, new Error("The local Python worker failed unexpectedly. Retry or use Live Judge0 if it is configured."));
      };
      worker.onmessageerror = () => {
        this.fail(requestId, new Error("The local Python worker returned an unreadable response. Retry or use Live Judge0 if it is configured."));
      };

      try {
        worker.postMessage({ requestId, sourceCode, execution, testCases });
      } catch {
        this.fail(requestId, new Error("The local Python worker could not accept this run. Retry or use Live Judge0 if it is configured."));
      }
    });
  }

  private handleMessage(requestId: number, message: unknown) {
    const pending = this.pending;
    if (!pending || pending.requestId !== requestId || !isRecord(message) || message.requestId !== requestId) return;

    if (message.type === "ready") {
      pending.ready = true;
      clearTimeout(pending.timer);
      pending.onStatus?.("running");
      pending.timer = setTimeout(() => {
        this.fail(
          requestId,
          new Error(
            `Local Python execution timed out after ${this.executionTimeoutMs / 1000} seconds. The worker was restarted; retry or use Live Judge0 if it is configured.`,
          ),
        );
      }, this.executionTimeoutMs);
      return;
    }

    if (message.type === "error") {
      const detail = typeof message.message === "string" ? message.message.slice(0, 1_000) : "Unknown runtime failure.";
      const prefix = pending.ready ? "Python execution failed" : "The Python runtime could not load";
      this.fail(requestId, new Error(`${prefix}: ${detail}. Check your connection, retry, or use Live Judge0 if it is configured.`));
      return;
    }

    if (message.type === "result" && isLocalPythonTestResult(message.result)) {
      clearTimeout(pending.timer);
      this.pending = null;
      pending.resolve(message.result);
    }
  }

  private fail(requestId: number, error: Error) {
    const pending = this.pending;
    if (!pending || pending.requestId !== requestId) return;
    clearTimeout(pending.timer);
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
    pending.reject(error);
  }
}

const localPythonWorker = new LocalPythonWorkerClient();

export function executeInLocalPython(
  sourceCode: string,
  execution: MissionExecutionContract,
  testCases: PublicPythonTestCase[],
  onStatus?: (phase: LocalPythonPhase) => void,
) {
  return localPythonWorker.execute(sourceCode, execution, testCases, onStatus);
}
