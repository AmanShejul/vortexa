import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/missions/route";
import { missions } from "@/lib/missions";

describe("GET /api/missions", () => {
  it("returns canonical mission metadata without including private test cases", async () => {
    const response = GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.count).toBe(missions.length);
    expect(payload.missions).toHaveLength(missions.length);
    expect(payload.missions[0]).toMatchObject({
      id: missions[0].id,
      slug: missions[0].slug,
      topic: missions[0].topic,
      hintMetadata: missions[0].hintMetadata,
    });
    expect(JSON.stringify(payload)).not.toContain("Private test");
    expect(JSON.stringify(payload)).not.toContain("hidden-1");
  });
});
