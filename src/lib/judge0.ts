const POLL_INTERVAL_MS = 250;
const POLL_TIMEOUT_MS = 8_000;
const NETWORK_TIMEOUT_MS = 5_000;
const PYTHON_LANGUAGE_ID = 71;

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
  ) {
    super(message);
    this.name = "Judge0ServiceError";
  }
}

function getConfig(): { submissionsUrl: string; headers: Record<string, string>; languageId: number } {
  const configuredUrl = process.env.JUDGE0_API_URL?.trim();
  if (!configuredUrl) throw new Judge0ServiceError("Code execution service is not configured.", 503);

  let normalizedUrl: string;
  try {
    normalizedUrl = new URL(configuredUrl).toString().replace(/\/+$/, "");
  } catch {
    throw new Judge0ServiceError("Code execution service configuration is invalid.", 503);
  }

  const submissionsUrl = normalizedUrl.endsWith("/submissions")
    ? normalizedUrl
    : `${normalizedUrl}/submissions`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const apiKey = process.env.JUDGE0_API_KEY?.trim();
  if (apiKey) {
    const authHeader = process.env.JUDGE0_AUTH_HEADER?.trim() || "X-Auth-Token";
    const authPrefix = process.env.JUDGE0_AUTH_PREFIX ?? "";
    headers[authHeader] = `${authPrefix}${apiKey}`;
  }

  const configuredLanguageId = process.env.JUDGE0_PYTHON_LANGUAGE_ID?.trim();
  const languageId = configuredLanguageId ? Number(configuredLanguageId) : PYTHON_LANGUAGE_ID;
  if (!Number.isInteger(languageId) || languageId <= 0) {
    throw new Judge0ServiceError("Code execution language configuration is invalid.", 503);
  }

  return { submissionsUrl, headers, languageId };
}

async function requestJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Judge0ServiceError("Code execution service authentication failed.", 503);
      }
      if (response.status === 429 || response.status >= 500) {
        throw new Judge0ServiceError("Code execution service is temporarily unavailable.", 503);
      }
      throw new Judge0ServiceError("Code execution service rejected the request.", 502);
    }
    return payload;
  } catch (error) {
    if (error instanceof Judge0ServiceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Judge0ServiceError("Code execution service timed out.", 504);
    }
    throw new Judge0ServiceError("Code execution service is unavailable.", 503);
  } finally {
    clearTimeout(timer);
  }
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function decode(value: unknown): string | undefined {
  return typeof value === "string" ? Buffer.from(value, "base64").toString("utf8") : undefined;
}

function getNumber(value: unknown): number | undefined {
  const numericValue = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseExecutionResult(payload: unknown): Judge0ExecutionResult {
  if (!payload || typeof payload !== "object") {
    throw new Judge0ServiceError("Code execution service returned an invalid response.", 502);
  }
  const data = payload as Record<string, unknown>;
  const status = data.status && typeof data.status === "object" ? (data.status as Record<string, unknown>) : null;
  const statusId = getNumber(data.status_id) ?? getNumber(status?.id);
  if (!statusId) throw new Judge0ServiceError("Code execution service returned no execution status.", 502);

  return {
    statusId,
    statusDescription: getString(status?.description) ?? "Unknown",
    stdout: decode(data.stdout),
    stderr: decode(data.stderr),
    compileOutput: decode(data.compile_output),
    message: getString(data.message),
    timeMs: getNumber(data.time) === undefined ? undefined : getNumber(data.time)! * 1000,
  };
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function executePython(sourceCode: string, stdin?: string): Promise<Judge0ExecutionResult> {
  const config = getConfig();
  const headers = config.headers;
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
    { method: "POST", headers, body: JSON.stringify(createPayload) },
    NETWORK_TIMEOUT_MS,
  );
  if (!created || typeof created !== "object" || typeof (created as { token?: unknown }).token !== "string") {
    throw new Judge0ServiceError("Code execution service did not return a submission token.", 502);
  }

  const token = (created as { token: string }).token;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const payload = await requestJson(
      `${config.submissionsUrl}/${encodeURIComponent(token)}?base64_encoded=true&fields=stdout,stderr,compile_output,message,time,status,status_id`,
      { method: "GET", headers },
      NETWORK_TIMEOUT_MS,
    );
    const result = parseExecutionResult(payload);
    if (result.statusId > 2) return result;
    await wait(POLL_INTERVAL_MS);
  }

  throw new Judge0ServiceError("Code execution exceeded the polling timeout.", 504);
}
