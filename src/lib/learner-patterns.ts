// Local (browser-only) learner pattern tracking. This keeps the E-02
// "recurring mistakes across a learner's work" and "track demonstrated
// skills by concept" story working even when Supabase persistence is not
// configured. All data stays in this browser's localStorage.

import { buildLearnerAnalytics, type LearnerAnalytics } from "@/lib/adaptive-learner";
import { missions } from "@/lib/missions";

export interface LocalAttemptRecord {
  missionId: string;
  category: string;
  concepts: string[];
  passed: boolean;
  executionStatus?: string;
  passedTests?: number;
  totalTests?: number;
  mode?: "run" | "submit";
  executionSource?: "local" | "live";
  concept?: string;
  confidence?: "high" | "medium" | "low";
  evidence?: string[];
  submissionId?: string;
  recordedAt: string;
}

export interface MistakePattern {
  category: string;
  occurrences: number;
  missionIds: string[];
}

export interface ConceptStat {
  concept: string;
  attempts: number;
  failures: number;
}

const STORAGE_KEY = "codequest:local-attempts:v1";
const MAX_RECORDS = 200;

function readStorage(): LocalAttemptRecord[] {
  if (typeof window === "undefined") return [];
  return parseLocalAttempts(getLocalAttemptsSnapshot());
}

export function parseLocalAttempts(raw: string | null): LocalAttemptRecord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (record): record is LocalAttemptRecord =>
        Boolean(record)
        && typeof record === "object"
        && typeof (record as LocalAttemptRecord).missionId === "string"
        && typeof (record as LocalAttemptRecord).category === "string"
        && Array.isArray((record as LocalAttemptRecord).concepts),
    ).map((record) => ({
      ...record,
      passed: record.passed === true,
      executionStatus: record.executionStatus ?? (record.passed ? "passed" : "wrong_answer"),
      passedTests: typeof record.passedTests === "number" ? record.passedTests : record.passed ? 1 : 0,
      totalTests: typeof record.totalTests === "number" ? record.totalTests : 1,
      mode: record.mode ?? "run",
      executionSource: record.executionSource ?? "local",
      evidence: Array.isArray(record.evidence) ? record.evidence : [],
    }));
  } catch {
    return [];
  }
}

export function getLocalAttemptsSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage?.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function subscribeToLocalAttempts(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  const onLocalAttempt = () => callback();
  window.addEventListener("storage", onStorage);
  window.addEventListener("codequest:local-attempts", onLocalAttempt);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("codequest:local-attempts", onLocalAttempt);
  };
}

export function recordLocalAttempt(attempt: Omit<LocalAttemptRecord, "recordedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const records = readStorage();
    if (attempt.submissionId && records.some((record) => record.submissionId === attempt.submissionId)) return;
    records.push({ ...attempt, recordedAt: new Date().toISOString() });
    const trimmed = records.slice(-MAX_RECORDS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new Event("codequest:local-attempts"));
  } catch {
    // Storage is best-effort; never break the arena.
  }
}

export function getLocalAttempts(): LocalAttemptRecord[] {
  return readStorage();
}

export function getLocalLearnerAnalytics(attempts = readStorage()): LearnerAnalytics {
  return buildLearnerAnalytics({
    missions,
    completions: [],
    attempts: attempts.map((attempt, index) => ({
      id: attempt.submissionId ?? `${attempt.missionId}-${attempt.recordedAt}-${index}`,
      submissionId: attempt.submissionId,
      missionId: attempt.missionId,
      executionStatus: attempt.executionStatus ?? (attempt.passed ? "passed" : "wrong_answer"),
      passedTests: attempt.passedTests ?? (attempt.passed ? 1 : 0),
      totalTests: attempt.totalTests ?? 1,
      mode: attempt.mode ?? "run",
      executionSource: attempt.executionSource ?? "local",
      mistakeCategory: attempt.category,
      mistakeConcept: attempt.concept,
      mistakeConfidence: attempt.confidence,
      mistakeEvidence: attempt.evidence,
      createdAt: attempt.recordedAt,
    })),
  });
}

// Recurring mistake categories across ALL missions the learner attempted
// in this browser, most frequent first.
export function getRepeatedMistakePatterns(minOccurrences = 2, attempts = readStorage()): MistakePattern[] {
  const byCategory = new Map<string, { occurrences: number; missionIds: Set<string> }>();
  for (const attempt of attempts) {
    if (attempt.passed || attempt.category === "PASSED") continue;
    const entry = byCategory.get(attempt.category) ?? { occurrences: 0, missionIds: new Set<string>() };
    entry.occurrences += 1;
    entry.missionIds.add(attempt.missionId);
    byCategory.set(attempt.category, entry);
  }
  return [...byCategory.entries()]
    .filter(([, entry]) => entry.occurrences >= minOccurrences)
    .map(([category, entry]) => ({
      category,
      occurrences: entry.occurrences,
      missionIds: [...entry.missionIds],
    }))
    .sort((left, right) => right.occurrences - left.occurrences);
}

// Per-concept skill signal: attempts and failures tagged with the mission's
// concept labels. "weakest" = lowest pass rate with at least 2 attempts.
export function getConceptStats(attempts = readStorage()): ConceptStat[] {
  const byConcept = new Map<string, { attempts: number; failures: number }>();
  for (const attempt of attempts) {
    for (const concept of attempt.concepts) {
      const entry = byConcept.get(concept) ?? { attempts: 0, failures: 0 };
      entry.attempts += 1;
      if (!attempt.passed) entry.failures += 1;
      byConcept.set(concept, entry);
    }
  }
  return [...byConcept.entries()]
    .map(([concept, entry]) => ({ concept, attempts: entry.attempts, failures: entry.failures }))
    .sort((left, right) => (right.failures / Math.max(1, right.attempts)) - (left.failures / Math.max(1, left.attempts)));
}

export function getWeakestConcepts(limit = 3, attempts = readStorage()): ConceptStat[] {
  return getConceptStats(attempts).filter((stat) => stat.attempts >= 2).slice(0, limit);
}

// Suggest the next mission by matching the learner's weakest concept to a
// mission they have not yet completed locally.
export function suggestNextMissionId(
  missions: Array<{ id: string; concepts: string[] }>,
  completedMissionIds: string[],
  attempts = readStorage(),
): string | null {
  const weakest = getWeakestConcepts(1, attempts)[0];
  if (!weakest) return null;
  const completed = new Set(completedMissionIds);
  const candidate = missions.find(
    (mission) => !completed.has(mission.id) && mission.concepts.includes(weakest.concept),
  );
  if (candidate) return candidate.id;
  const fallback = missions.find((mission) => !completed.has(mission.id));
  return fallback ? fallback.id : null;
}
