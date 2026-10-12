import { afterEach, describe, expect, it, vi } from "vitest";
import { executePython, Judge0ServiceError } from "@/lib/judge0";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Judge0 execution client", () => {
  it("reports a specific configuration error when the Judge0 URL is missing", async () => {
    vi.stubEnv("JUDGE0_API_URL", "");

    await expect(executePython("print('hello')")).rejects.toMatchObject({
      name: "Judge0ServiceError",
      code: "configuration_missing",
      httpStatus: 503,
    } satisfies Partial<Judge0ServiceError>);
  });

  it("treats the environment-template Judge0 URL as unconfigured", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://your-judge0-provider.example");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(executePython("print('hello')")).rejects.toMatchObject({
      name: "Judge0ServiceError",
      code: "configuration_missing",
      httpStatus: 503,
    } satisfies Partial<Judge0ServiceError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits base64 Python source using the configured language and polls its token", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://judge0.test");
    vi.stubEnv("JUDGE0_API_KEY", "test-token");
    vi.stubEnv("JUDGE0_AUTH_HEADER", "X-Auth-Token");
    vi.stubEnv("JUDGE0_AUTH_PREFIX", "");
    vi.stubEnv("JUDGE0_PYTHON_LANGUAGE_ID", "71");

    const source = "print('hello')";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "submission-token" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        stdout: Buffer.from("hello\n").toString("base64"),
        status: { id: 3, description: "Accepted" },
        time: "0.01",
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await executePython(source);

    expect(result.statusId).toBe(3);
    expect(result.stdout).toBe("hello\n");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [submitUrl, submitInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(submitUrl).toBe("https://judge0.test/submissions?base64_encoded=true&wait=false");
    expect((submitInit.headers as Record<string, string>)["X-Auth-Token"]).toBe("test-token");
    expect(JSON.parse(String(submitInit.body))).toMatchObject({
      source_code: Buffer.from(source, "utf8").toString("base64"),
      language_id: 71,
      enable_network: false,
    });

    const [pollUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(pollUrl).toContain("/submissions/submission-token?base64_encoded=true");
  });

  it("normalizes a configured submissions path without duplicating it", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://judge0.test/submissions/");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "submission-token" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status_id: 3, status: { id: 3, description: "Accepted" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await executePython("print('hello')");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://judge0.test/submissions?base64_encoded=true&wait=false");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("https://judge0.test/submissions/submission-token?");
  });

  it("classifies provider authentication failures without treating them as learner errors", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://judge0.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid token", token: "secret-token" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(executePython("print('hello')")).rejects.toMatchObject({
      code: "authentication_failed",
      httpStatus: 503,
    } satisfies Partial<Judge0ServiceError>);
    const diagnostic = JSON.parse(String(errorSpy.mock.calls[0]?.[1]));
    expect(diagnostic).toMatchObject({
      phase: "submit",
      method: "POST",
      status: 401,
      response: { error: "invalid token", },
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("secret-token");
    errorSpy.mockRestore();
  });

  it("classifies provider rate limits separately", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://judge0.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "quota exceeded" }), { status: 429 })));

    await expect(executePython("print('hello')")).rejects.toMatchObject({
      code: "provider_rate_limited",
      httpStatus: 503,
    } satisfies Partial<Judge0ServiceError>);
  });

  it("classifies Judge0 queue overload separately from internal failures", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://judge0.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "queue is full" }), { status: 503 })));

    await expect(executePython("print('hello')")).rejects.toMatchObject({
      code: "provider_overloaded",
      httpStatus: 503,
      message: "Code execution service queue is overloaded. Try again shortly.",
    } satisfies Partial<Judge0ServiceError>);
  });

  it("classifies malformed submission requests without exposing the upstream body", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://judge0.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "language_id is invalid", source_code: "private source" }), { status: 400 })));

    await expect(executePython("print('hello')")).rejects.toMatchObject({
      code: "request_rejected",
      httpStatus: 502,
    } satisfies Partial<Judge0ServiceError>);
  });

  it("classifies provider outages without returning the provider response body", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://judge0.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream details", { status: 500 })));

    await expect(executePython("print('hello')")).rejects.toMatchObject({
      code: "provider_internal_error",
      httpStatus: 502,
      message: "Code execution service encountered an internal error.",
    } satisfies Partial<Judge0ServiceError>);
  });

  it("classifies network failures as provider unavailable", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://judge0.test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new TypeError("private network detail"), {
      cause: { code: "ECONNRESET", hostname: "judge0.test", secret: "must-not-log" },
    })));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(executePython("print('hello')")).rejects.toMatchObject({
      code: "provider_unavailable",
      httpStatus: 503,
      message: "Code execution service is unavailable.",
    } satisfies Partial<Judge0ServiceError>);
    const diagnostic = JSON.parse(String(errorSpy.mock.calls[0]?.[1]));
    expect(diagnostic).toMatchObject({
      phase: "submit",
      method: "POST",
      target: "judge0.test/submissions",
      status: "network",
      cause: { name: "TypeError", message: "private network detail", code: "ECONNRESET", hostname: "judge0.test" },
    });
    expect(JSON.stringify(diagnostic)).not.toContain("must-not-log");
    errorSpy.mockRestore();
  });

  it("rejects missing submission tokens and malformed provider JSON", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://judge0.test");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 201 }))
      .mockResolvedValueOnce(new Response("{not-json", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(executePython("print('hello')")).rejects.toMatchObject({ code: "invalid_response" });

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response("{not-json", { status: 201 }));
    await expect(executePython("print('hello')")).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("treats Judge0 internal execution statuses as provider failures", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://judge0.test");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "token" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status_id: 13,
        status: { id: 13, description: "Internal Error" },
      }), { status: 200 })));

    await expect(executePython("print('hello')")).rejects.toMatchObject({
      code: "provider_internal_error",
      httpStatus: 502,
    } satisfies Partial<Judge0ServiceError>);
  });

  it("stops polling when a per-test deadline expires", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://judge0.test");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "token" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status_id: 1,
        status: { id: 1, description: "In Queue" },
      }), { status: 200 })));

    await expect(executePython("print('hello')", undefined, { perTestTimeoutMs: 30 })).rejects.toMatchObject({
      code: "poll_timeout",
      httpStatus: 504,
    } satisfies Partial<Judge0ServiceError>);
  });

  it("stops polling at the overall execution deadline", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://judge0.test");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "token" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status_id: 2,
        status: { id: 2, description: "Processing" },
      }), { status: 200 })));

    await expect(executePython("print('hello')", undefined, {
      deadlineAt: Date.now() + 30,
      perTestTimeoutMs: 1_000,
    })).rejects.toMatchObject({
      code: "execution_deadline",
      httpStatus: 504,
    } satisfies Partial<Judge0ServiceError>);
  });

  it("rejects malformed base64 output and never logs provider response details", async () => {
    vi.stubEnv("JUDGE0_API_URL", "https://judge0.test");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "token" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        stdout: "not-base64!",
        status_id: 3,
        status: { id: 3, description: "Accepted" },
      }), { status: 200 })));

    await expect(executePython("print('hello')")).rejects.toMatchObject({
      code: "invalid_response",
      message: "Code execution service returned an invalid response.",
    });
  });
});
