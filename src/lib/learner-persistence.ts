import { createSupabaseServiceClient, ensureUserOwnsRecord } from "@/lib/supabase";
import { attemptRecordToAnalytics, buildLearnerAnalytics, type EvidenceConfidence } from "@/lib/adaptive-learner";
import { missions } from "@/lib/missions";
import type {
  AttemptOutcome,
  ExecutionSource,
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
  mistakeConcept?: string;
  mistakeConfidence?: EvidenceConfidence;
  mistakeEvidence?: string[];
  executionSource?: ExecutionSource;
  submissionId?: string;
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

function isAnalyticsSchemaError(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "42703"
    || error?.code === "PGRST204"
    || error?.code === "PGRST205"
    || /column .* does not exist|schema cache/i.test(error?.message ?? "");
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
      mistakeConcept: attempt.mistakeConcept,
      mistakeConfidence: attempt.mistakeConfidence,
      mistakeEvidence: attempt.mistakeEvidence,
      executionSource: attempt.executionSource,
      submissionId: attempt.submissionId,
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
      concept: mistake.concept,
      evidence: mistake.evidence,
    }));

  const analyticsAttempts = args.attempts
    .map((attempt) => attemptRecordToAnalytics(attempt))
    .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt));
  const analytics = buildLearnerAnalytics({
    attempts: analyticsAttempts,
    completions: args.completions
      .filter((completion): completion is MissionCompletionRecord => Boolean(completion.missionId))
      .map((completion) => ({ missionId: completion.missionId })),
    missions,
  });
  const knownCategories = new Set(analytics.mistakePatterns.map((pattern) => pattern.category));
  const legacyPatterns = args.mistakes
    .filter((mistake): mistake is LearnerMistakeRecord => Boolean(mistake.category && mistake.lastSeenAt))
    .filter((mistake) => !knownCategories.has(mistake.category))
    .map((mistake) => ({
      category: mistake.category,
      occurrences: mistake.occurrenceCount ?? 1,
      missionIds: mistake.missionId ? [mistake.missionId] : [],
      concept: mistake.concept,
      firstSeenAt: mistake.lastSeenAt,
      lastSeenAt: mistake.lastSeenAt,
      isRecurring: (mistake.occurrenceCount ?? 1) >= 2,
      improving: false,
      confidence: "low" as const,
      evidence: mistake.evidence ?? [],
    }));

  return {
    missionsCompleted,
    totalAttempts,
    successRate,
    currentLearningProgress: Math.min(100, Math.round((missionsCompleted / Math.max(1, totalAttempts || 1)) * 100)),
    recentAttempts,
    repeatedMistakes,
    conceptStats: analytics.conceptStats,
    mistakePatterns: [...analytics.mistakePatterns, ...legacyPatterns],
    recommendations: analytics.recommendations,
    recentLearningProgress: analytics.recentLearningProgress,
    empty: totalAttempts === 0 && missionsCompleted === 0 && repeatedMistakes.length === 0,
  };
}

export function ensureUserMatchesRecord(learnerId: string, userId: string): void {
  ensureUserOwnsRecord(learnerId, userId);
}

export async function persistMissionAttempt(args: PersistedAttemptArgs): Promise<{ id: string; skipped: boolean; duplicate?: boolean }> {
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
    mistake_concept: args.mistakeConcept ?? null,
    mistake_confidence: args.mistakeConfidence ?? null,
    mistake_evidence: args.mistakeEvidence ?? [],
    execution_source: args.executionSource ?? "live",
    submission_id: args.submissionId ?? null,
    completed: shouldCompleteMission({
      status: args.executionStatus,
      allPassed: Boolean(args.allPassed),
      mode: args.mode,
    }),
    created_at: new Date().toISOString(),
  };

  let { data: attempt, error } = await client
    .from("mission_attempts")
    .insert([executionPayload])
    .select("id")
    .single();

  if (error && isAnalyticsSchemaError(error)) {
    const legacyPayload = {
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
    ({ data: attempt, error } = await client
      .from("mission_attempts")
      .insert([legacyPayload])
      .select("id")
      .single());
  }

  if (error) {
    if (args.submissionId && error.code === "23505") {
      const { data: existingAttempt, error: lookupError } = await client
        .from("mission_attempts")
        .select("id")
        .eq("learner_id", args.learnerId)
        .eq("submission_id", args.submissionId)
        .maybeSingle();
      if (lookupError) throw new Error(lookupError.message);
      if (existingAttempt?.id) return { id: existingAttempt.id, skipped: false, duplicate: true };
    }
    throw new Error(error.message);
  }
  if (!attempt?.id) {
    throw new Error("The progress service did not return an attempt ID.");
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

  if (args.mistakeCategory && args.mistakeCategory !== "PASSED" && args.mistakeCategory !== "UNKNOWN_ERROR") {
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
    let { error: mistakeError } = await client
      .from("learner_mistakes")
      .upsert(
        {
          id: existingMistake?.id,
          learner_id: args.learnerId,
          mission_id: args.missionId,
          category: args.mistakeCategory,
          concept: args.mistakeConcept ?? null,
          evidence: args.mistakeEvidence ?? [],
          occurrence_count: occurrenceCount,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "learner_id,mission_id,category" },
      );

    if (mistakeError && isAnalyticsSchemaError(mistakeError)) {
      ({ error: mistakeError } = await client
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
        ));
    }

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
    mistakeConcept: data.mistake_concept ?? undefined,
    mistakeConfidence: data.mistake_confidence ?? undefined,
    mistakeEvidence: Array.isArray(data.mistake_evidence) ? data.mistake_evidence : undefined,
    executionSource: data.execution_source ?? undefined,
    submissionId: data.submission_id ?? undefined,
    createdAt: data.created_at,
  };
}
