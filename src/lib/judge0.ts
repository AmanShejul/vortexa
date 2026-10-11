const POLL_INTERVAL_MS = 250;
const DEFAULT_TEST_TIMEOUT_MS = 8_000;
const NETWORK_TIMEOUT_MS = 5_000;
const MAX_POLL_REQUESTS = 40;
const MAX_SUBMISSION_TOKEN_LENGTH = 512;
const PYTHON_LANGUAGE_ID = 71;

export type Judge0ServiceErrorCode =
  | "configuration_missing"
  | "configuration_invalid"
  | "authentication_failed"
  | "provider_unavailable"
  | "provider_timeout"
  | "request_rejected"
  | "provider_internal_error"
  | "invalid_response"
  | "poll_timeout"
  | "execution_deadline";

export interface Judge0ExecutionResult {
  statusId: number;
  statusDescription: string;
  stdout?: string;
  stderr?: string;
  compileOutput?: string;
  message?: string;
  timeMs?: number;
}

export class Judge0ServiceError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: 502 | 503 | 504,
    public readonly code: Judge0ServiceErrorCode = "provider_unavailable",
  ) {
    super(message);
    this.name = "Judge0ServiceError";
  }
}

export interface Judge0ExecutionLimits {
  deadlineAt?: number;
  perTestTimeoutMs?: number;
  signal?: AbortSignal;
}

function getConfig(): { submissionsUrl: string; headers: Record<string, string>; languageId: number } {
  const configuredUrl = process.env.JUDGE0_API_URL?.trim();
  if (!configuredUrl) {
    throw new Judge0ServiceError("Code execution service is not configured.", 503, "configuration_missing");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredUrl);
    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
      throw new Error("Unsupported endpoint protocol.");
    }
    if (parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
      throw new Error("Credentials or query strings are not supported in the endpoint URL.");
    }
  } catch {
    throw new Judge0ServiceError("Code execution service configuration is invalid.", 503, "configuration_invalid");
  }
  const normalizedUrl = parsedUrl.toString().replace(/\/+$/, "");
  const submissionsUrl = normalizedUrl.endsWith("/submissions") ? normalizedUrl : `${normalizedUrl}/submissions`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const apiKey = process.env.JUDGE0_API_KEY?.trim();
  if (apiKey) {
    const authHeader = process.env.JUDGE0_AUTH_HEADER?.trim() || "X-Auth-Token";
    const authPrefix = process.env.JUDGE0_AUTH_PREFIX ?? "";
    if (!/^[A-Za-z0-9-]{1,80}$/.test(authHeader) || /[\r\n]/.test(authPrefix)) {
      throw new Judge0ServiceError("Code execution service configuration is invalid.", 503, "configuration_invalid");
    }
    headers[authHeader] = `${authPrefix}${apiKey}`;
  }

  const configuredLanguageId = process.env.JUDGE0_PYTHON_LANGUAGE_ID?.trim();
  const languageId = configuredLanguageId ? Number(configuredLanguageId) : PYTHON_LANGUAGE_ID;
  if (!Number.isInteger(languageId) || languageId <= 0) {
    throw new Judge0ServiceError("Code execution language configuration is invalid.", 503, "configuration_invalid");
  }

  return { submissionsUrl, headers, languageId };
}

function getRequestTimeout(limits: Judge0ExecutionLimits, perTestDeadline: number): number {
  if (limits.signal?.aborted) {
    throw new Judge0ServiceError("The execution request exceeded its total time limit.", 504, "execution_deadline");
  }
  const remaining = Math.min(perTestDeadline, limits.deadlineAt ?? Number.POSITIVE_INFINITY) - Date.now();
  if (remaining <= 0) {
    const overallExpired = limits.deadlineAt !== undefined && Date.now() >= limits.deadlineAt;
    throw new Judge0ServiceError(
      overallExpired ? "The execution request exceeded its total time limit." : "The test exceeded its execution time limit.",
      504,
      overallExpired ? "execution_deadline" : "poll_timeout",
    );
  }
  return Math.max(1, Math.min(NETWORK_TIMEOUT_MS, remaining));
}

async function readBoundedResponse(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("Execution deadline exceeded.", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Judge0ServiceError("Code execution service returned an invalid response.", 502, "invalid_response");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(output);
}

async function requestJson(
  url: string,
  init: RequestInit,
  limits: Judge0ExecutionLimits,
  perTestDeadline: number,
): Promise<unknown> {
  const controller = new AbortController();
  const abortForDeadline = () => controller.abort();
  limits.signal?.addEventListener("abort", abortForDeadline, { once: true });
  const timeoutMs = getRequestTimeout(limits, perTestDeadline);
  const requestDeadline = Date.now() + timeoutMs;
  const timer = setTimeout(abortForDeadline, timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 401 || response.status === 403) {
        throw new Judge0ServiceError("Code execution service authentication failed.", 503, "authentication_failed");
      }
      if (response.status === 429) {
        throw new Judge0ServiceError("Code execution service is temporarily busy. Try again shortly.", 503, "provider_unavailable");
      }
      if (response.status >= 500) {
        throw new Judge0ServiceError("Code execution service encountered an internal error.", 502, "provider_internal_error");
      }
      throw new Judge0ServiceError("Code execution service rejected the request.", 502, "request_rejected");
    }

    const text = await readBoundedResponse(response, 256 * 1024, controller.signal);
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new Judge0ServiceError("Code execution service returned an invalid response.", 502, "invalid_response");
    }
    return payload;
  } catch (error) {
    if (error instanceof Judge0ServiceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      if (limits.signal?.aborted || (limits.deadlineAt !== undefined && Date.now() >= limits.deadlineAt)) {
        throw new Judge0ServiceError("The execution request exceeded its total time limit.", 504, "execution_deadline");
      }
      if (Date.now() >= perTestDeadline) {
        throw new Judge0ServiceError("The test exceeded its execution time limit.", 504, "poll_timeout");
      }
      if (Date.now() >= requestDeadline) {
        throw new Judge0ServiceError("Code execution service timed out.", 504, "provider_timeout");
      }
      throw new Judge0ServiceError("Code execution service timed out.", 504, "provider_timeout");
    }
    throw new Judge0ServiceError("Code execution service is unavailable.", 503, "provider_unavailable");
  } finally {
    clearTimeout(timer);
    limits.signal?.removeEventListener("abort", abortForDeadline);
  }
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function decode(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Judge0ServiceError("Code execution service returned an invalid response.", 502, "invalid_response");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Judge0ServiceError("Code execution service returned an invalid response.", 502, "invalid_response");
  }
  return decoded.toString("utf8");
}

function getNumber(value: unknown): number | undefined {
  const numericValue = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function getString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Judge0ServiceError("Code execution service returned an invalid response.", 502, "invalid_response");
  }
  return value;
}

function parseExecutionResult(payload: unknown): Judge0ExecutionResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Judge0ServiceError("Code execution service returned an invalid response.", 502, "invalid_response");
  }
  const data = payload as Record<string, unknown>;
  if (data.status !== undefined && data.status !== null
    && (!data.status || typeof data.status !== "object" || Array.isArray(data.status))) {
    throw new Judge0ServiceError("Code execution service returned an invalid response.", 502, "invalid_response");
  }
  const status = data.status && typeof data.status === "object" && !Array.isArray(data.status)
    ? (data.status as Record<string, unknown>)
    : null;
  const statusId = getNumber(data.status_id) ?? getNumber(status?.id);
  if (statusId === undefined || !Number.isInteger(statusId) || statusId < 1 || statusId > 14) {
    throw new Judge0ServiceError("Code execution service returned no valid execution status.", 502, "invalid_response");
  }
  if (data.status_id !== undefined && status?.id !== undefined
    && getNumber(data.status_id) !== getNumber(status.id)) {
    throw new Judge0ServiceError("Code execution service returned conflicting execution statuses.", 502, "invalid_response");
  }
  const description = getString(status?.description);
  if (status && (typeof status.id !== "number" && typeof status.id !== "string")) {
    throw new Judge0ServiceError("Code execution service returned an invalid response.", 502, "invalid_response");
  }

  return {
    statusId,
    statusDescription: description ?? "Unknown",
    stdout: decode(data.stdout),
    stderr: decode(data.stderr),
    compileOutput: decode(data.compile_output),
    message: getString(data.message),
    timeMs: getNumber(data.time) === undefined ? undefined : getNumber(data.time)! * 1000,
  };
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Execution deadline exceeded.", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Execution deadline exceeded.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function executePython(
  sourceCode: string,
  stdin?: string,
  limits: Judge0ExecutionLimits = {},
): Promise<Judge0ExecutionResult> {
  const config = getConfig();
  const perTestTimeout = Math.max(1, limits.perTestTimeoutMs ?? DEFAULT_TEST_TIMEOUT_MS);
  const perTestDeadline = Date.now() + perTestTimeout;
  const effectiveDeadline = Math.min(perTestDeadline, limits.deadlineAt ?? Number.POSITIVE_INFINITY);
  const createPayload = {
    source_code: encode(sourceCode),
    language_id: config.languageId,
    ...(stdin === undefined ? {} : { stdin: encode(stdin) }),
    cpu_time_limit: 2,
    wall_time_limit: 5,
    memory_limit: 128000,
    max_file_size: 1024,
    max_processes_and_or_threads: 32,
    enable_network: false,
  };

  const created = await requestJson(
    `${config.submissionsUrl}?base64_encoded=true&wait=false`,
    { method: "POST", headers: config.headers, body: JSON.stringify(createPayload) },
    limits,
    perTestDeadline,
  );
  if (!created || typeof created !== "object" || Array.isArray(created) || typeof (created as { token?: unknown }).token !== "string" || !(created as { token: string }).token.trim()) {
    throw new Judge0ServiceError("Code execution service did not return a submission token.", 502, "invalid_response");
  }

  const token = (created as { token: string }).token;
  if (token.length > MAX_SUBMISSION_TOKEN_LENGTH || /[\r\n]/.test(token)) {
    throw new Judge0ServiceError("Code execution service returned an invalid response.", 502, "invalid_response");
  }
  let pollRequests = 0;
  while (Date.now() < effectiveDeadline && pollRequests < MAX_POLL_REQUESTS) {
    pollRequests += 1;
    const payload = await requestJson(
      `${config.submissionsUrl}/${encodeURIComponent(token)}?base64_encoded=true&fields=stdout,stderr,compile_output,message,time,status,status_id`,
      { method: "GET", headers: config.headers },
      limits,
      perTestDeadline,
    );
    const result = parseExecutionResult(payload);
    if (result.statusId > 2) {
      if (result.statusId === 13 || result.statusId === 14) {
        throw new Judge0ServiceError("Code execution service encountered an internal error.", 502, "provider_internal_error");
      }
      return result;
    }
    const remaining = effectiveDeadline - Date.now();
    if (remaining <= 0) break;
    try {
      await wait(Math.min(POLL_INTERVAL_MS, remaining), limits.signal);
    } catch (error) {
      if (limits.signal?.aborted || (limits.deadlineAt !== undefined && Date.now() >= limits.deadlineAt)) {
        throw new Judge0ServiceError("The execution request exceeded its total time limit.", 504, "execution_deadline");
      }
      throw error;
    }
  }

  const overallExpired = limits.deadlineAt !== undefined && Date.now() >= limits.deadlineAt;
  throw new Judge0ServiceError(
    overallExpired ? "The execution request exceeded its total time limit." : "The test exceeded its execution time limit.",
    504,
    overallExpired ? "execution_deadline" : "poll_timeout",
  );
}
