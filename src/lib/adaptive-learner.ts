import type {
  ExecutionResult,
  Mission,
  MissionAttemptRecord,
  MissionCompletionRecord,
  TestCaseResult,
} from "@/types";

export const ADAPTIVE_MISTAKE_CATEGORIES = [
  "PASSED",
  "OFF_BY_ONE",
  "EMPTY_INPUT_UNHANDLED",
  "INCORRECT_CONDITIONAL_LOGIC",
  "ALGORITHMIC_REASONING",
  "INCORRECT_LOGIC",
  "OUTPUT_FORMAT_MISMATCH",
  "SYNTAX_ERROR",
  "RUNTIME_ERROR",
  "TIMEOUT",
  "UNKNOWN_ERROR",
] as const;

export type AdaptiveMistakeCategory = typeof ADAPTIVE_MISTAKE_CATEGORIES[number];
export type EvidenceConfidence = "high" | "medium" | "low";
export type SkillProficiency = "insufficient_evidence" | "needs_practice" | "developing" | "strong";

export interface MistakeAnalysis {
  category: AdaptiveMistakeCategory;
  concept?: string;
  confidence: EvidenceConfidence;
  ambiguous: boolean;
  evidence: string[];
}

export interface AnalysisTestCase {
  id: string;
  label: string;
  args?: unknown[];
  stdin?: string;
  expected?: unknown;
  expectedStdout?: string;
  result: Pick<TestCaseResult, "status" | "expectedOutput" | "actualOutput" | "errorMessage">;
}

export interface AnalyzeMistakeArgs {
  mission: Mission;
  executionResult: Pick<ExecutionResult, "status" | "allPassed" | "tests">;
  sourceCode: string;
  testCases?: readonly AnalysisTestCase[];
}

export interface LearnerAnalyticsAttempt {
  id?: string;
  submissionId?: string;
  missionId: string;
  executionStatus: string;
  passedTests: number;
  totalTests: number;
  mode: "run" | "submit";
  executionSource?: "local" | "live";
  mistakeCategory?: string;
  mistakeConcept?: string;
  mistakeConfidence?: EvidenceConfidence;
  mistakeEvidence?: string[];
  createdAt: string;
}

export interface ConceptSkillStat {
  concept: string;
  attempts: number;
  passes: number;
  failures: number;
  sampleSize: number;
  successRate: number | null;
  proficiency: SkillProficiency;
  trend: "improving" | "steady" | "needs_attention" | "insufficient_evidence";
  explanation: string;
}

export interface MistakePatternSummary {
  category: string;
  occurrences: number;
  missionIds: string[];
  concept?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  isRecurring: boolean;
  improving: boolean;
  confidence: EvidenceConfidence;
  evidence: string[];
}

export interface LearningRecommendation {
  missionId: string;
  title: string;
  difficulty: Mission["difficulty"];
  explanation: string;
  targetedConcept?: string;
}

export interface RecentLearningProgress {
  id: string;
  missionId: string;
  title: string;
  status: string;
  passedTests: number;
  totalTests: number;
  mode: "run" | "submit";
  createdAt: string;
}

export interface LearnerAnalytics {
  conceptStats: ConceptSkillStat[];
  mistakePatterns: MistakePatternSummary[];
  recommendations: LearningRecommendation[];
  recentLearningProgress: RecentLearningProgress[];
}

const difficultyRank: Record<Mission["difficulty"], number> = {
  Beginner: 1,
  Intermediate: 2,
  Advanced: 3,
};

function normalizeConcept(value: string): string {
  return value.trim().toLowerCase();
}

function missionHasConcept(mission: Mission, ...needles: string[]): boolean {
  const values = [mission.category, mission.topic, ...mission.concepts].map(normalizeConcept);
  return needles.some((needle) => values.some((value) => value.includes(needle)));
}

function parseJson(value: string | undefined): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function valueKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isEmptyValue(value: unknown): boolean {
  return value === "" || (Array.isArray(value) && value.length === 0)
    || Boolean(value && typeof value === "object" && Object.keys(value).length === 0);
}

function isEmptyCase(test: AnalysisTestCase): boolean {
  if (/empty|zero items|no input|single item/i.test(test.label)) return true;
  if (test.stdin === "") return true;
  return Array.isArray(test.args) && test.args.some(isEmptyValue);
}

function numericDelta(test: AnalysisTestCase): number | null {
  const expected = parseJson(test.result.expectedOutput);
  const actual = parseJson(test.result.actualOutput);
  return typeof expected === "number" && typeof actual === "number" ? actual - expected : null;
}

function firstRelevantConcept(mission: Mission, category: AdaptiveMistakeCategory): string | undefined {
  if (category === "OFF_BY_ONE" && mission.concepts.length > 0) {
    return mission.concepts.find((concept) => /loop|iteration|index|search|range|array|list/i.test(concept)) ?? mission.concepts[0];
  }
  if (category === "EMPTY_INPUT_UNHANDLED") {
    return mission.concepts.find((concept) => /edge|input|list|string|array|validation/i.test(concept)) ?? mission.concepts[0];
  }
  return mission.concepts[0];
}

function publicFailedTests(args: AnalyzeMistakeArgs): AnalysisTestCase[] {
  const resultById = new Map(args.executionResult.tests.map((test) => [test.id, test]));
  if (args.testCases) {
    return args.testCases
      .filter((test) => test.id.startsWith("public-") && test.result.status !== "passed")
      .map((test) => ({ ...test, result: resultById.get(test.id) ?? test.result }));
  }
  return args.executionResult.tests
    .filter((test) => test.id.startsWith("public-") && test.status !== "passed")
    .map((test) => ({ id: test.id, label: test.label, result: test }));
}

export function analyzeMistake(args: AnalyzeMistakeArgs): MistakeAnalysis {
  const { mission, executionResult, sourceCode } = args;
  if (executionResult.status === "passed" && executionResult.allPassed) {
    return { category: "PASSED", confidence: "high", ambiguous: false, evidence: ["All trusted mission tests passed."] };
  }
  if (executionResult.status === "compilation_error") {
    return { category: "SYNTAX_ERROR", confidence: "high", ambiguous: false, evidence: ["The trusted execution result reported a compilation error."] };
  }
  if (executionResult.status === "runtime_error") {
    return { category: "RUNTIME_ERROR", confidence: "high", ambiguous: false, evidence: ["The trusted execution result reported a runtime error."] };
  }
  if (executionResult.status === "time_limit_exceeded") {
    return { category: "TIMEOUT", confidence: "high", ambiguous: false, evidence: ["The trusted execution result exceeded the time limit."] };
  }
  if (executionResult.status === "execution_error") {
    return { category: "UNKNOWN_ERROR", confidence: "high", ambiguous: false, evidence: ["The execution service did not provide learner-code evidence."] };
  }

  const failedTests = executionResult.tests.filter((test) => test.status !== "passed");
  const publicFailures = publicFailedTests(args);
  const evidence: string[] = publicFailures.slice(0, 2).map((test) => `Public test failed: ${test.label.slice(0, 120)}.`);
  const hasLoopBoundaryCode = /\b(for|while)\b|\brange\s*\(/.test(sourceCode) && /\b(range|len\s*\(|enumerate|index|mid)\b/.test(sourceCode);
  const boundaryDelta = publicFailures.map(numericDelta).find((delta) => delta === 1 || delta === -1);

  if (publicFailures.some(isEmptyCase)) {
    return {
      category: "EMPTY_INPUT_UNHANDLED",
      concept: firstRelevantConcept(mission, "EMPTY_INPUT_UNHANDLED"),
      confidence: "high",
      ambiguous: false,
      evidence: [...evidence, "A public empty-input or empty-collection case failed."],
    };
  }

  if (hasLoopBoundaryCode && boundaryDelta !== undefined && missionHasConcept(mission, "loop", "iteration", "array", "list", "search", "range")) {
    return {
      category: "OFF_BY_ONE",
      concept: firstRelevantConcept(mission, "OFF_BY_ONE"),
      confidence: "medium",
      ambiguous: false,
      evidence: [...evidence, "A numeric result differed from the expected boundary by one while loop/index code was present."],
    };
  }

  const publicTypeMismatch = publicFailures.find((test) => {
    const expected = parseJson(test.result.expectedOutput);
    const actual = parseJson(test.result.actualOutput);
    return expected !== undefined && actual !== undefined && valueKind(expected) !== valueKind(actual);
  });
  if (publicTypeMismatch) {
    return {
      category: "OUTPUT_FORMAT_MISMATCH",
      concept: mission.concepts[0],
      confidence: "high",
      ambiguous: false,
      evidence: [...evidence, "A public result had a different value type or shape from the mission contract."],
    };
  }

  if (missionHasConcept(mission, "condition", "conditional") && /\bif\b|\belif\b|\belse\b/.test(sourceCode)) {
    return {
      category: "INCORRECT_CONDITIONAL_LOGIC",
      concept: mission.concepts.find((concept) => /condition/i.test(concept)) ?? mission.concepts[0],
      confidence: "medium",
      ambiguous: false,
      evidence: [...evidence, "The mission focuses on conditions and the executable code contains conditional branches."],
    };
  }

  if (missionHasConcept(mission, "search", "sort", "graph", "recursion", "dynamic", "hash", "algorithm")) {
    return {
      category: "ALGORITHMIC_REASONING",
      concept: mission.concepts[0],
      confidence: "low",
      ambiguous: true,
      evidence: [...evidence, "The available output shows a wrong answer on an algorithm-focused mission, but does not isolate the exact reasoning error."],
    };
  }

  if (failedTests.length > 0 || executionResult.status === "wrong_answer") {
    return {
      category: "INCORRECT_LOGIC",
      concept: mission.concepts[0],
      confidence: "low",
      ambiguous: true,
      evidence: [...evidence, "The code executed but the available test evidence does not identify a more specific pattern."],
    };
  }

  return {
    category: "UNKNOWN_ERROR",
    confidence: "low",
    ambiguous: true,
    evidence: ["There was not enough trusted test evidence to classify this result."],
  };
}

export function toMentorMistakeCategory(category: AdaptiveMistakeCategory): string {
  if (category === "SYNTAX_ERROR" || category === "RUNTIME_ERROR" || category === "TIMEOUT") return "SYNTAX_OR_RUNTIME";
  if (category === "INCORRECT_CONDITIONAL_LOGIC" || category === "ALGORITHMIC_REASONING") return "INCORRECT_LOGIC";
  return category;
}

function attemptPassed(attempt: LearnerAnalyticsAttempt): boolean {
  return attempt.executionStatus === "passed" && attempt.totalTests > 0 && attempt.passedTests === attempt.totalTests;
}

function sortAttempts(attempts: readonly LearnerAnalyticsAttempt[]): LearnerAnalyticsAttempt[] {
  return [...attempts].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function buildConceptStats(attempts: readonly LearnerAnalyticsAttempt[], missions: readonly Mission[]): ConceptSkillStat[] {
  const byConcept = new Map<string, { attempts: number; passes: number; history: boolean[] }>();
  const ordered = sortAttempts(attempts);
  for (const attempt of ordered) {
    const mission = missions.find((candidate) => candidate.id === attempt.missionId);
    if (!mission) continue;
    for (const concept of mission.concepts) {
      const current = byConcept.get(concept) ?? { attempts: 0, passes: 0, history: [] };
      current.attempts += 1;
      if (attemptPassed(attempt)) current.passes += 1;
      current.history.push(attemptPassed(attempt));
      byConcept.set(concept, current);
    }
  }

  return [...byConcept.entries()].map(([concept, value]) => {
    const failures = value.attempts - value.passes;
    const successRate = value.attempts >= 2 ? Math.round((value.passes / value.attempts) * 100) : null;
    const lastTwo = value.history.slice(-2);
    const trend: ConceptSkillStat["trend"] = value.attempts < 2
      ? "insufficient_evidence"
      : lastTwo[0] === false && lastTwo[1] === true
        ? "improving"
        : successRate !== null && successRate < 50
          ? "needs_attention"
          : "steady";
    const proficiency: SkillProficiency = value.attempts < 2
      ? "insufficient_evidence"
      : successRate !== null && successRate < 50
        ? "needs_practice"
        : successRate !== null && successRate >= 80
          ? "strong"
          : "developing";
    const explanation = value.attempts < 2
      ? "Not enough evidence yet; at least two mission attempts are needed."
      : `${value.passes} of ${value.attempts} recorded attempts passed this concept.`;
    return { concept, attempts: value.attempts, passes: value.passes, failures, sampleSize: value.attempts, successRate, proficiency, trend, explanation };
  }).sort((left, right) => {
    if (left.proficiency === "insufficient_evidence" && right.proficiency !== "insufficient_evidence") return 1;
    return (left.successRate ?? 101) - (right.successRate ?? 101) || right.attempts - left.attempts;
  });
}

function buildMistakePatterns(attempts: readonly LearnerAnalyticsAttempt[]): MistakePatternSummary[] {
  const groups = new Map<string, { attempts: LearnerAnalyticsAttempt[] }>();
  for (const attempt of attempts) {
    if (!attempt.mistakeCategory || attempt.mistakeCategory === "PASSED" || attempt.mistakeCategory === "UNKNOWN_ERROR") continue;
    const key = attempt.mistakeCategory;
    const group = groups.get(key) ?? { attempts: [] };
    group.attempts.push(attempt);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([category, group]) => {
    const ordered = sortAttempts(group.attempts);
    const last = ordered[ordered.length - 1];
    const previousFailure = ordered.slice(0, -1).some((attempt) => !attemptPassed(attempt));
    const laterPassingRetest = Boolean(last && attempts.some((attempt) =>
      attemptPassed(attempt)
      && attempt.createdAt > last.createdAt
      && ordered.some((mistakeAttempt) => mistakeAttempt.missionId === attempt.missionId),
    ));
    const improving = Boolean(last && (attemptPassed(last) || laterPassingRetest) && previousFailure);
    return {
      category,
      occurrences: ordered.length,
      missionIds: [...new Set(ordered.map((attempt) => attempt.missionId))],
      concept: last?.mistakeConcept ?? ordered.find((attempt) => attempt.mistakeConcept)?.mistakeConcept,
      firstSeenAt: ordered[0]?.createdAt ?? "",
      lastSeenAt: last?.createdAt ?? "",
      isRecurring: ordered.length >= 2,
      improving,
      confidence: ordered.find((attempt) => attempt.mistakeConfidence === "high")?.mistakeConfidence
        ?? ordered.find((attempt) => attempt.mistakeConfidence === "medium")?.mistakeConfidence
        ?? "low",
      evidence: [...new Set(ordered.flatMap((attempt) => attempt.mistakeEvidence ?? []))].slice(0, 3),
    };
  }).sort((left, right) => right.occurrences - left.occurrences || right.lastSeenAt.localeCompare(left.lastSeenAt));
}

function buildRecommendations(
  attempts: readonly LearnerAnalyticsAttempt[],
  missions: readonly Mission[],
  conceptStats: readonly ConceptSkillStat[],
  mistakePatterns: readonly MistakePatternSummary[],
  completedMissionIds: readonly string[],
): LearningRecommendation[] {
  const completed = new Set(completedMissionIds);
  const candidates = missions.filter((mission) => !completed.has(mission.id));
  if (candidates.length === 0) return [];
  const attemptedIds = new Set(attempts.map((attempt) => attempt.missionId));
  const weakConcept = conceptStats.find((stat) => stat.proficiency === "needs_practice")?.concept;
  const recurring = mistakePatterns.find((pattern) => pattern.isRecurring && !pattern.improving);
  const focus = recurring?.concept ?? weakConcept;

  let selected: Mission;
  let explanation: string;
  if (attempts.length === 0) {
    selected = candidates.find((mission) => mission.difficulty === "Beginner") ?? candidates[0];
    explanation = "Recommended as a beginner starting point because there is not enough learner history yet.";
  } else {
    const maxPassedDifficulty = Math.max(...attempts.filter(attemptPassed).map((attempt) => {
      const mission = missions.find((candidate) => candidate.id === attempt.missionId);
      return mission ? difficultyRank[mission.difficulty] : 0;
    }), 0);
    const ranked = candidates.map((mission, index) => {
      const matchesFocus = Boolean(focus && mission.concepts.includes(focus));
      const difficultyFit = maxPassedDifficulty > 0
        ? Math.abs(difficultyRank[mission.difficulty] - Math.min(3, maxPassedDifficulty + 1))
        : difficultyRank[mission.difficulty];
      return { mission, score: (matchesFocus ? 100 : 0) - difficultyFit * 10 - (attemptedIds.has(mission.id) ? 4 : 0) - index / 1000 };
    }).sort((left, right) => right.score - left.score);
    selected = ranked[0].mission;
    if (recurring && recurring.occurrences >= 2 && focus) {
      explanation = `Recommended because you struggled with ${focus} in ${recurring.occurrences} recorded attempts.`;
    } else if (weakConcept) {
      const stat = conceptStats.find((item) => item.concept === weakConcept);
      explanation = `Recommended to strengthen ${weakConcept}; ${stat?.passes ?? 0} of ${stat?.attempts ?? 0} recorded attempts passed.`;
    } else {
      explanation = `Recommended as a next challenge based on your recorded mission results.`;
    }
  }
  return [{ missionId: selected.id, title: selected.title, difficulty: selected.difficulty, explanation, ...(focus ? { targetedConcept: focus } : {}) }];
}

export function buildLearnerAnalytics(args: {
  attempts: readonly LearnerAnalyticsAttempt[];
  completions?: readonly Pick<MissionCompletionRecord, "missionId">[];
  missions: readonly Mission[];
}): LearnerAnalytics {
  const conceptStats = buildConceptStats(args.attempts, args.missions);
  const mistakePatterns = buildMistakePatterns(args.attempts);
  const completedMissionIds = args.completions?.map((completion) => completion.missionId) ?? [];
  const recommendations = buildRecommendations(args.attempts, args.missions, conceptStats, mistakePatterns, completedMissionIds);
  const recentLearningProgress = [...args.attempts]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 6)
    .map((attempt, index) => ({
      id: attempt.id ?? attempt.submissionId ?? `${attempt.missionId}-${attempt.createdAt}-${index}`,
      missionId: attempt.missionId,
      title: args.missions.find((mission) => mission.id === attempt.missionId)?.title ?? attempt.missionId,
      status: attempt.executionStatus,
      passedTests: attempt.passedTests,
      totalTests: attempt.totalTests,
      mode: attempt.mode,
      createdAt: attempt.createdAt,
    }));
  return { conceptStats, mistakePatterns, recommendations, recentLearningProgress };
}

export function attemptRecordToAnalytics(attempt: Partial<MissionAttemptRecord>): LearnerAnalyticsAttempt | null {
  if (!attempt.missionId || !attempt.createdAt) return null;
  return {
    id: attempt.id,
    submissionId: attempt.submissionId,
    missionId: attempt.missionId,
    executionStatus: attempt.executionStatus ?? "wrong_answer",
    passedTests: attempt.passedTests ?? 0,
    totalTests: attempt.totalTests ?? 0,
    mode: attempt.mode ?? "run",
    executionSource: attempt.executionSource,
    mistakeCategory: attempt.mistakeCategory,
    mistakeConcept: attempt.mistakeConcept,
    mistakeConfidence: attempt.mistakeConfidence,
    mistakeEvidence: attempt.mistakeEvidence,
    createdAt: attempt.createdAt,
  };
}
