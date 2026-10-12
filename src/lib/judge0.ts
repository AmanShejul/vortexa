const POLL_INTERVAL_MS = 250;
const DEFAULT_TEST_TIMEOUT_MS = 8_000;
const NETWORK_TIMEOUT_MS = 5_000;
const MAX_POLL_REQUESTS = 40;
const MAX_SUBMISSION_TOKEN_LENGTH = 512;
const MAX_DIAGNOSTIC_BODY_BYTES = 16 * 1024;
const PYTHON_LANGUAGE_ID = 71;
const PLACEHOLDER_JUDGE0_HOST = "your-judge0-provider.example";

export type Judge0ServiceErrorCode =
  | "configuration_missing"
  | "configuration_invalid"
  | "authentication_failed"
  | "provider_unavailable"
  | "provider_rate_limited"
  | "provider_overloaded"
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

type Judge0RequestPhase = "submit" | "poll";

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
    if (parsedUrl.hostname.toLowerCase() === PLACEHOLDER_JUDGE0_HOST) {
      throw new Judge0ServiceError("Code execution service is not configured.", 503, "configuration_missing");
    }
  } catch (error) {
    if (error instanceof Judge0ServiceError) throw error;
    throw new Judge0ServiceError("Code execution service configuration is invalid.", 503, "configuration_invalid");
  }
  const normalizedUrl = parsedUrl.toString().replace(/\/+$/, "");
  const submissionsUrl = normalizedUrl.endsWith("/submissions") ? normalizedUrl : `${normalizedUrl}/submissions`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const configuredApiKey = process.env.JUDGE0_API_KEY?.trim();
  const apiKey = configuredApiKey && configuredApiKey !== "your-judge0-key" ? configuredApiKey : "";
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

function safeRequestTarget(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const safePath = url.pathname.replace(/(\/submissions\/)[^/]+/i, "$1[token]");
    return `${url.hostname}${safePath}`;
  } catch {
    return "invalid-target";
  }
}

function redactDiagnosticText(value: string): string {
  return value
    .slice(0, 1_000)
    .replace(/(api[-_ ]?key|authorization|token|secret|password)\s*[:=]\s*[^,\s}]+/gi, "$1=[redacted]");
}

function sanitizeDiagnosticBody(body: string): Record<string, unknown> {
  if (!body.trim()) return { kind: "empty" };

  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { kind: Array.isArray(parsed) ? "array" : typeof parsed };
    }

    const source = parsed as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    for (const key of ["error", "message", "detail", "status_code"]) {
      const value = source[key];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        safe[key] = typeof value === "string" ? redactDiagnosticText(value) : value;
      }
    }
    if (source.status && typeof source.status === "object" && !Array.isArray(source.status)) {
      const status = source.status as Record<string, unknown>;
      safe.status = {
        ...(typeof status.id === "number" || typeof status.id === "string" ? { id: status.id } : {}),
        ...(typeof status.description === "string" ? { description: redactDiagnosticText(status.description) } : {}),
      };
    }
    return Object.keys(safe).length > 0 ? safe : { kind: "json", keys: Object.keys(source).slice(0, 20) };
  } catch {
    return { kind: "text", preview: redactDiagnosticText(body) };
  }
}

function sanitizeNetworkError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") return { kind: "unknown" };
  const source = error as { name?: unknown; message?: unknown; cause?: unknown };
  const safe: Record<string, unknown> = {
    name: typeof source.name === "string" ? source.name : "Error",
  };
  if (typeof source.message === "string") safe.message = redactDiagnosticText(source.message);
  if (source.cause && typeof source.cause === "object") {
    const cause = source.cause as Record<string, unknown>;
    for (const key of ["code", "errno", "syscall", "hostname", "port"]) {
      if (typeof cause[key] === "string" || typeof cause[key] === "number") safe[key] = cause[key];
    }
  }
  return safe;
}

function logUpstreamFailure(
  rawUrl: string,
  status: number | "network",
  body = "",
  error?: unknown,
  phase: Judge0RequestPhase = "submit",
  method = "GET",
) {
  const diagnostic = {
    phase,
    method,
    target: safeRequestTarget(rawUrl),
    status,
    response: sanitizeDiagnosticBody(body),
    ...(status === "network" ? { cause: sanitizeNetworkError(error) } : {}),
  };
  // Keep the diagnostic as one JSON string. Next's development log serializer
  // can discard object arguments, which previously reduced useful failures to
  // "[judge0] upstream request failure {}".
  console.error("[judge0] upstream request failure", JSON.stringify(diagnostic));
}

function logResponseParseFailure(
  rawUrl: string,
  phase: Judge0RequestPhase,
  method: string,
  status: number,
  bodyLength: number,
) {
  console.error("[judge0] response parse failure", JSON.stringify({
    phase,
    method,
    target: safeRequestTarget(rawUrl),
    status,
    bodyLength,
  }));
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
  phase: Judge0RequestPhase,
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
      let responseBody = "";
      try {
        responseBody = await readBoundedResponse(response, MAX_DIAGNOSTIC_BODY_BYTES, controller.signal);
      } catch {
        await response.body?.cancel().catch(() => undefined);
      }
      logUpstreamFailure(url, response.status, responseBody, undefined, phase, init.method ?? "GET");
      if (response.status === 401 || response.status === 403) {
        throw new Judge0ServiceError("Code execution service authentication failed.", 503, "authentication_failed");
      }
      if (response.status === 429) {
        throw new Judge0ServiceError("Code execution service rate limit reached. Try again shortly.", 503, "provider_rate_limited");
      }
      if (response.status === 503) {
        throw new Judge0ServiceError("Code execution service queue is overloaded. Try again shortly.", 503, "provider_overloaded");
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
      logResponseParseFailure(url, phase, init.method ?? "GET", response.status, text.length);
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
    if (limits.signal?.aborted || (limits.deadlineAt !== undefined && Date.now() >= limits.deadlineAt)) {
      throw new Judge0ServiceError("The execution request exceeded its total time limit.", 504, "execution_deadline");
    }
    if (Date.now() >= perTestDeadline) {
      throw new Judge0ServiceError("The test exceeded its execution time limit.", 504, "poll_timeout");
    }
    logUpstreamFailure(url, "network", "", error, phase, init.method ?? "GET");
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
    "submit",
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
      "poll",
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
