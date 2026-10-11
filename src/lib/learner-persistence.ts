import { createSupabaseServiceClient, ensureUserOwnsRecord } from "@/lib/supabase";
import type {
  AttemptOutcome,
  ExecutionMode,
  ExecutionResult,
  LearnerMistakeRecord,
  MissionAttemptRecord,
  MissionCompletionRecord,
  ProgressSummary,
} from "@/types";

export interface PersistedAttemptArgs {
  learnerId: string;
  missionId: string;
  mode: ExecutionMode;
  executionStatus: ExecutionResult["status"] | AttemptOutcome;
  passedTests: number;
  totalTests: number;
  hintLevel?: number;
  mistakeCategory?: string;
  allPassed?: boolean;
  attemptId?: string;
}

export function normalizeAttemptOutcome(status: ExecutionResult["status"] | AttemptOutcome | string): AttemptOutcome {
  switch (status) {
    case "passed":
      return "passed";
    case "wrong_answer":
      return "wrong_answer";
    case "compilation_error":
      return "syntax_error";
    case "runtime_error":
      return "runtime_error";
    case "time_limit_exceeded":
      return "timeout";
    case "execution_error":
      return "infrastructure_error";
    default:
      return "wrong_answer";
  }
}

export function shouldCompleteMission(result: {
  status: ExecutionResult["status"] | AttemptOutcome;
  allPassed: boolean;
  mode: ExecutionMode;
}): boolean {
  return result.mode === "submit" && result.status === "passed" && result.allPassed;
}

export function buildProgressSummary(args: {
  attempts: Partial<MissionAttemptRecord>[];
  completions: Partial<MissionCompletionRecord>[];
  mistakes: Partial<LearnerMistakeRecord>[];
}): ProgressSummary {
  const totalAttempts = args.attempts.length;
  const missionsCompleted = args.completions.length;
  const successfulAttempts = args.attempts.filter((attempt) => attempt.executionStatus === "passed").length;
  const successRate = totalAttempts === 0 ? 0 : (successfulAttempts / totalAttempts) * 100;
  const recentAttempts = args.attempts
    .filter((attempt): attempt is MissionAttemptRecord => Boolean(attempt.id && attempt.missionId && attempt.createdAt))
    .slice(0, 5)
    .map((attempt) => ({
      id: attempt.id,
      learnerId: attempt.learnerId ?? "",
      missionId: attempt.missionId,
      executionStatus: attempt.executionStatus ?? "wrong_answer",
      passedTests: attempt.passedTests ?? 0,
      totalTests: attempt.totalTests ?? 0,
      mode: attempt.mode ?? "run",
      hintLevel: attempt.hintLevel,
      mistakeCategory: attempt.mistakeCategory,
      createdAt: attempt.createdAt,
    }));
  const repeatedMistakes = args.mistakes
    .filter((mistake): mistake is LearnerMistakeRecord => Boolean(mistake.id && mistake.category && mistake.lastSeenAt))
    .sort((left, right) => (right.occurrenceCount ?? 0) - (left.occurrenceCount ?? 0))
    .slice(0, 5)
    .map((mistake) => ({
      id: mistake.id,
      learnerId: mistake.learnerId ?? "",
      missionId: mistake.missionId ?? "",
      category: mistake.category,
      occurrenceCount: mistake.occurrenceCount ?? 0,
      lastSeenAt: mistake.lastSeenAt,
    }));

  return {
    missionsCompleted,
    totalAttempts,
    successRate,
    currentLearningProgress: Math.min(100, Math.round((missionsCompleted / Math.max(1, totalAttempts || 1)) * 100)),
    recentAttempts,
    repeatedMistakes,
    empty: totalAttempts === 0 && missionsCompleted === 0 && repeatedMistakes.length === 0,
  };
}

export function ensureUserMatchesRecord(learnerId: string, userId: string): void {
  ensureUserOwnsRecord(learnerId, userId);
}

export async function persistMissionAttempt(args: PersistedAttemptArgs): Promise<{ id: string; skipped: boolean }> {
  const client = createSupabaseServiceClient();
  if (!client) {
    return { id: args.attemptId ?? "", skipped: true };
  }

  const normalizedStatus = normalizeAttemptOutcome(args.executionStatus);
  const executionPayload = {
    learner_id: args.learnerId,
    mission_id: args.missionId,
    mode: args.mode,
    execution_status: normalizedStatus,
    passed_tests: args.passedTests,
    total_tests: args.totalTests,
    hint_level: args.hintLevel ?? null,
    mistake_category: args.mistakeCategory ?? null,
    completed: shouldCompleteMission({
      status: args.executionStatus,
      allPassed: Boolean(args.allPassed),
      mode: args.mode,
    }),
    created_at: new Date().toISOString(),
  };

  const { data: attempt, error } = await client
    .from("mission_attempts")
    .insert([executionPayload])
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (shouldCompleteMission({
    status: args.executionStatus,
    allPassed: Boolean(args.allPassed),
    mode: args.mode,
  })) {
    const { error: completionError } = await client
      .from("mission_completions")
      .upsert(
        {
          learner_id: args.learnerId,
          mission_id: args.missionId,
          completed_at: new Date().toISOString(),
          attempt_id: attempt.id,
          passed_tests: args.passedTests,
          total_tests: args.totalTests,
        },
        { onConflict: "learner_id,mission_id" },
      );

    if (completionError) {
      throw new Error(completionError.message);
    }
  }

  if (args.mistakeCategory && args.mistakeCategory !== "PASSED") {
    const { data: existingMistake, error: selectError } = await client
      .from("learner_mistakes")
      .select("id, occurrence_count")
      .eq("learner_id", args.learnerId)
      .eq("mission_id", args.missionId)
      .eq("category", args.mistakeCategory)
      .maybeSingle();

    if (selectError) {
      throw new Error(selectError.message);
    }

    const occurrenceCount = (existingMistake?.occurrence_count ?? 0) + 1;
    const { error: mistakeError } = await client
      .from("learner_mistakes")
      .upsert(
        {
          id: existingMistake?.id,
          learner_id: args.learnerId,
          mission_id: args.missionId,
          category: args.mistakeCategory,
          occurrence_count: occurrenceCount,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "learner_id,mission_id,category" },
      );

    if (mistakeError) {
      throw new Error(mistakeError.message);
    }
  }

  return { id: attempt.id, skipped: false };
}

export async function getProgressSummary(learnerId: string): Promise<ProgressSummary | null> {
  const client = createSupabaseServiceClient();
  if (!client) {
    return null;
  }

  const [{ data: attempts, error: attemptError }, { data: completions, error: completionError }, { data: mistakes, error: mistakeError }] = await Promise.all([
    client.from("mission_attempts").select("*").eq("learner_id", learnerId).order("created_at", { ascending: false }),
    client.from("mission_completions").select("*").eq("learner_id", learnerId).order("completed_at", { ascending: false }),
    client.from("learner_mistakes").select("*").eq("learner_id", learnerId).order("occurrence_count", { ascending: false }),
  ]);

  if (attemptError || completionError || mistakeError) {
    throw new Error(attemptError?.message ?? completionError?.message ?? mistakeError?.message ?? "Progress lookup failed.");
  }

  return buildProgressSummary({
    attempts: attempts ?? [],
    completions: completions ?? [],
    mistakes: mistakes ?? [],
  });
}

export async function getAttemptForUser(learnerId: string, missionId: string, attemptId: string): Promise<MissionAttemptRecord | null> {
  const client = createSupabaseServiceClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("mission_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("learner_id", learnerId)
    .eq("mission_id", missionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    learnerId: data.learner_id,
    missionId: data.mission_id,
    executionStatus: normalizeAttemptOutcome(data.execution_status),
    passedTests: data.passed_tests,
    totalTests: data.total_tests,
    mode: data.mode,
    hintLevel: data.hint_level ?? undefined,
    mistakeCategory: data.mistake_category ?? undefined,
    createdAt: data.created_at,
  };
}
