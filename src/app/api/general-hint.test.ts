import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/hint/route";

describe("general mentor guidance", () => {
  it("works without execution evidence and does not mint an evidence token", async () => {
    const response = await POST(new Request("http://localhost/api/hint", {
      method: "POST",
      body: JSON.stringify({
        missionId: "sum-of-two-numbers",
        mode: "run",
        hintLevel: 1,
        general: true,
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.category).toBe("GENERAL_GUIDANCE");
    expect(payload.guidanceSource).toBe("general");
    expect(payload.nextEvidenceToken).toBeUndefined();
    expect(payload.explanation).toContain("General mission guidance");
  });

  it("still rejects malformed general guidance requests", async () => {
    const response = await POST(new Request("http://localhost/api/hint", {
      method: "POST",
      body: JSON.stringify({ missionId: "unknown-mission", mode: "run", hintLevel: 1, general: true }),
    }));

    expect(response.status).toBe(404);
  });

  it("uses the selected mission topic for function and stdin/stdout guidance", async () => {
    const binarySearch = await POST(new Request("http://localhost/api/hint", {
      method: "POST",
      body: JSON.stringify({
        missionId: "binary-search",
        mode: "run",
        hintLevel: 1,
        general: true,
      }),
    }));
    const binaryPayload = await binarySearch.json();
    const stdio = await POST(new Request("http://localhost/api/hint", {
      method: "POST",
      body: JSON.stringify({
        missionId: "count-input-lines",
        mode: "run",
        hintLevel: 1,
        general: true,
      }),
    }));
    const stdioPayload = await stdio.json();

    expect(binaryPayload.hint).toContain("Binary search");
    expect(stdioPayload.hint).toContain("input/output contract");
    expect(stdioPayload.hint).not.toContain("required function");
  });
});
