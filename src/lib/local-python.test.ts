import { describe, expect, it, vi } from "vitest";
import { LocalPythonWorkerClient } from "@/lib/local-python";

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  terminated = false;
  response: ((worker: FakeWorker, message: Record<string, unknown>) => void) | null = null;

  postMessage(message: Record<string, unknown>) {
    this.response?.(this, message);
  }

  terminate() {
    this.terminated = true;
  }

  send(message: Record<string, unknown>) {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}

function workerFactory(worker: FakeWorker) {
  return () => worker as unknown as Worker;
}

describe("LocalPythonWorkerClient", () => {
  it("reports runtime readiness and returns worker test results", async () => {
    const worker = new FakeWorker();
    worker.response = (currentWorker, request) => {
      const requestId = request.requestId as number;
      currentWorker.send({ type: "ready", requestId });
      currentWorker.send({
        type: "result",
        requestId,
        result: {
          tests: [{ id: "public-1", label: "Example 1", status: "passed" }],
          passedTests: 1,
          failedTests: 0,
          allPassed: true,
        },
      });
    };
    const client = new LocalPythonWorkerClient(workerFactory(worker));
    const phases: string[] = [];

    const result = await client.execute("print('hi')", "solution", [], (phase) => phases.push(phase));

    expect(phases).toEqual(["loading", "running"]);
    expect(result.allPassed).toBe(true);
    expect(worker.terminated).toBe(false);
  });

  it("terminates a timed-out worker and creates a fresh worker for the next attempt", async () => {
    const blockedWorker = new FakeWorker();
    blockedWorker.response = (currentWorker, request) => {
      currentWorker.send({ type: "ready", requestId: request.requestId });
    };
    const retryWorker = new FakeWorker();
    retryWorker.response = (currentWorker, request) => {
      const requestId = request.requestId as number;
      currentWorker.send({ type: "ready", requestId });
      currentWorker.send({
        type: "result",
        requestId,
        result: { tests: [], passedTests: 0, failedTests: 0, allPassed: false },
      });
    };
    const createWorker = vi.fn()
      .mockReturnValueOnce(blockedWorker as unknown as Worker)
      .mockReturnValueOnce(retryWorker as unknown as Worker);
    const client = new LocalPythonWorkerClient(createWorker, 5, 20);

    await expect(client.execute("while True: pass", "solution", [])).rejects.toThrow("timed out");
    expect(blockedWorker.terminated).toBe(true);

    const retried = await client.execute("pass", "solution", []);
    expect(retried.failedTests).toBe(0);
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it("reports worker errors and terminates the failed worker", async () => {
    const worker = new FakeWorker();
    worker.response = (currentWorker) => {
      queueMicrotask(() => currentWorker.onerror?.({ message: "worker crashed" } as ErrorEvent));
    };
    const client = new LocalPythonWorkerClient(workerFactory(worker));

    await expect(client.execute("pass", "solution", [])).rejects.toThrow("worker failed unexpectedly");
    expect(worker.terminated).toBe(true);
  });

  it("reports Pyodide loading failures clearly", async () => {
    const worker = new FakeWorker();
    worker.response = (currentWorker, request) => {
      currentWorker.send({
        type: "error",
        requestId: request.requestId,
        message: "NetworkError: failed to fetch runtime",
        runtimeReady: false,
      });
    };
    const client = new LocalPythonWorkerClient(workerFactory(worker));

    await expect(client.execute("pass", "solution", [])).rejects.toThrow(
      "Python runtime could not load: NetworkError: failed to fetch runtime",
    );
  });
});
