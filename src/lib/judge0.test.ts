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
});
