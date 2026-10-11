import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  isSupabasePersistenceConfigured: vi.fn(),
  getProgressSummary: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  isSupabasePersistenceConfigured: mocks.isSupabasePersistenceConfigured,
}));

vi.mock("@/lib/learner-persistence", () => ({
  getProgressSummary: mocks.getProgressSummary,
}));

import { GET } from "@/app/api/progress/route";

beforeEach(() => {
  mocks.getAuthenticatedUser.mockReset();
  mocks.isSupabasePersistenceConfigured.mockReset();
  mocks.getProgressSummary.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/progress", () => {
  it("returns an unavailable response rather than fabricated empty metrics when persistence is not configured", async () => {
    mocks.isSupabasePersistenceConfigured.mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/progress"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "Saved progress is not configured.",
    });
    expect(mocks.getProgressSummary).not.toHaveBeenCalled();
  });

  it("continues to return actual owner-scoped progress for an authenticated learner", async () => {
    const summary = {
      missionsCompleted: 1,
      totalAttempts: 2,
      successRate: 50,
      currentLearningProgress: 50,
      recentAttempts: [],
      repeatedMistakes: [],
      empty: false,
    };
    mocks.isSupabasePersistenceConfigured.mockReturnValue(true);
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "verified-learner" });
    mocks.getProgressSummary.mockResolvedValue(summary);

    const response = await GET(new Request("http://localhost/api/progress"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, summary });
    expect(mocks.getProgressSummary).toHaveBeenCalledWith("verified-learner");
  });
});
