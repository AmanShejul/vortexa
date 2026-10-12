import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/missions/[id]/route";

describe("GET /api/missions/:id", () => {
  it("returns public detail for a canonical mission", async () => {
    const response = await GET(new Request("http://localhost/api/missions/factorial-number"), {
      params: Promise.resolve({ id: "factorial-number" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.mission).toMatchObject({ id: "factorial-number", title: "Factorial Number" });
    expect(JSON.stringify(payload)).not.toContain("Private test");
    expect(JSON.stringify(payload)).not.toContain("hidden-1");
  });

  it("rejects malformed IDs and reports missing missions", async () => {
    const malformed = await GET(new Request("http://localhost/api/missions/%20"), {
      params: Promise.resolve({ id: "bad id" }),
    });
    const missing = await GET(new Request("http://localhost/api/missions/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(malformed.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});
