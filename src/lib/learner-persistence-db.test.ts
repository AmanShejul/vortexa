import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase")>();
  return { ...actual, createSupabaseServiceClient: mocks.createServiceClient };
});

import { persistMissionAttempt } from "@/lib/learner-persistence";

describe("server-side progress writes", () => {
  beforeEach(() => {
    mocks.createServiceClient.mockReset();
    mocks.from.mockReset();
  });

  it("records an authorized server result and upserts a passing submission completion", async () => {
    const attempts = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: { id: "attempt-from-db" }, error: null }),
    };
    attempts.insert.mockReturnValue(attempts);
    attempts.select.mockReturnValue(attempts);
    const completions = { upsert: vi.fn().mockResolvedValue({ error: null }) };
    const mistakes = { upsert: vi.fn() };
    mocks.from.mockImplementation((table: string) => ({
      mission_attempts: attempts,
      mission_completions: completions,
      learner_mistakes: mistakes,
    })[table]);
    mocks.createServiceClient.mockReturnValue({ from: mocks.from });

    const result = await persistMissionAttempt({
      learnerId: "verified-learner",
      missionId: "sum-of-two-numbers",
      mode: "submit",
      executionStatus: "passed",
      passedTests: 4,
      totalTests: 4,
      allPassed: true,
    });

    expect(result).toEqual({ id: "attempt-from-db", skipped: false });
    expect(attempts.insert).toHaveBeenCalledWith([expect.objectContaining({
      learner_id: "verified-learner",
      execution_status: "passed",
      completed: true,
    })]);
    expect(completions.upsert).toHaveBeenCalledWith(expect.objectContaining({
      learner_id: "verified-learner",
      mission_id: "sum-of-two-numbers",
      attempt_id: "attempt-from-db",
      passed_tests: 4,
      total_tests: 4,
    }), { onConflict: "learner_id,mission_id" });
    expect(mistakes.upsert).not.toHaveBeenCalled();
  });

  it("does not create a completion for an incorrect submission", async () => {
    const attempts = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: { id: "wrong-attempt" }, error: null }),
    };
    attempts.insert.mockReturnValue(attempts);
    attempts.select.mockReturnValue(attempts);
    const completions = { upsert: vi.fn() };
    mocks.from.mockImplementation((table: string) => table === "mission_attempts" ? attempts : completions);
    mocks.createServiceClient.mockReturnValue({ from: mocks.from });

    await persistMissionAttempt({
      learnerId: "verified-learner",
      missionId: "sum-of-two-numbers",
      mode: "submit",
      executionStatus: "wrong_answer",
      passedTests: 0,
      totalTests: 4,
      allPassed: false,
    });

    expect(completions.upsert).not.toHaveBeenCalled();
  });

  it("does not create a completion when the attempt insert fails", async () => {
    const attempts = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "database unavailable" } }),
    };
    attempts.insert.mockReturnValue(attempts);
    attempts.select.mockReturnValue(attempts);
    const completions = { upsert: vi.fn() };
    mocks.from.mockImplementation((table: string) => table === "mission_attempts" ? attempts : completions);
    mocks.createServiceClient.mockReturnValue({ from: mocks.from });

    await expect(persistMissionAttempt({
      learnerId: "verified-learner",
      missionId: "sum-of-two-numbers",
      mode: "submit",
      executionStatus: "passed",
      passedTests: 4,
      totalTests: 4,
      allPassed: true,
    })).rejects.toThrow("database unavailable");

    expect(completions.upsert).not.toHaveBeenCalled();
  });

  it("propagates completion-write failures instead of reporting saved progress", async () => {
    const attempts = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: { id: "attempt-without-completion" }, error: null }),
    };
    attempts.insert.mockReturnValue(attempts);
    attempts.select.mockReturnValue(attempts);
    const completions = { upsert: vi.fn().mockResolvedValue({ error: { message: "completion write denied" } }) };
    mocks.from.mockImplementation((table: string) => table === "mission_attempts" ? attempts : completions);
    mocks.createServiceClient.mockReturnValue({ from: mocks.from });

    await expect(persistMissionAttempt({
      learnerId: "verified-learner",
      missionId: "sum-of-two-numbers",
      mode: "submit",
      executionStatus: "passed",
      passedTests: 4,
      totalTests: 4,
      allPassed: true,
    })).rejects.toThrow("completion write denied");

    expect(completions.upsert).toHaveBeenCalledOnce();
  });

  it("treats a repeated submission reference as the same learning event", async () => {
    const attempts = {
      insert: vi.fn(),
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate submission" } }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "original-attempt" }, error: null }),
    };
    attempts.insert.mockReturnValue(attempts);
    attempts.select.mockReturnValue(attempts);
    attempts.eq.mockReturnValue(attempts);
    mocks.from.mockReturnValue(attempts);
    mocks.createServiceClient.mockReturnValue({ from: mocks.from });

    await expect(persistMissionAttempt({
      learnerId: "verified-learner",
      missionId: "sum-of-two-numbers",
      mode: "submit",
      executionStatus: "wrong_answer",
      passedTests: 1,
      totalTests: 4,
      submissionId: "submission-retry-1",
      mistakeCategory: "INCORRECT_LOGIC",
    })).resolves.toEqual({ id: "original-attempt", skipped: false, duplicate: true });
  });
});
