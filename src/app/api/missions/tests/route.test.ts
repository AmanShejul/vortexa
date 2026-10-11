import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/missions/tests/route";

describe("GET /api/missions/tests", () => {
  it("returns only public case inputs and expected values", async () => {
    const response = GET(new Request("http://localhost/api/missions/tests?missionId=sum-of-two-numbers"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.execution).toMatchObject({ kind: "function", functionName: "sum_two_numbers" });
    expect(payload.tests).toHaveLength(2);
    expect(payload.tests.every((test: { id: string }) => test.id.startsWith("public-"))).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("hidden");
    expect(JSON.stringify(payload)).not.toContain("Private test");
  });

  it("returns a public stdin/stdout contract without exposing private cases", async () => {
    const response = GET(new Request("http://localhost/api/missions/tests?missionId=count-input-lines"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.execution).toEqual({ kind: "stdin_stdout" });
    expect(payload.tests).toEqual([
      { id: "public-1", label: "Two lines with final newline", stdin: "red\nblue\n", expectedStdout: "2\n" },
      { id: "public-2", label: "Empty input", stdin: "", expectedStdout: "0\n" },
    ]);
    expect(JSON.stringify(payload)).not.toContain("single");
    expect(JSON.stringify(payload)).not.toContain("Private test");
  });

  it("rejects malformed and unknown mission IDs", async () => {
    const malformed = GET(new Request("http://localhost/api/missions/tests?missionId=bad%20id"));
    const unknown = GET(new Request("http://localhost/api/missions/tests?missionId=missing"));

    expect(malformed.status).toBe(400);
    expect(unknown.status).toBe(404);
  });
});
