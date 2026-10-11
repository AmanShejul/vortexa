export type Difficulty = "Beginner" | "Intermediate";

export type MissionCategory =
  | "Fundamentals"
  | "Conditionals"
  | "Loops"
  | "Arrays"
  | "Strings";

export type MissionStatus = "not_started" | "in_progress" | "completed";

export interface HintSet {
  nudge: string;
  approach: string;
  detailed: string;
}

export type FunctionParameterType = "integer" | "string" | "integer[]";

export interface FunctionParameter {
  name: string;
  type: FunctionParameterType;
}

export interface FunctionExecutionContract {
  functionName: string;
  parameters: FunctionParameter[];
  returnType: "integer" | "string";
}

export interface ExampleCase {
  input: string;
  output: string;
}

export interface Mission {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  difficulty: Difficulty;
  category: MissionCategory;
  concepts: string[];
  durationMinutes?: number;
  status: MissionStatus;
  starterCode: string;
  examples: ExampleCase[];
  constraints: string[];
  hints: HintSet;
  execution: FunctionExecutionContract;
}

export type ExecutionStatus =
  | "pending"
  | "running"
  | "passed"
  | "wrong_answer"
  | "compilation_error"
  | "runtime_error"
  | "time_limit_exceeded"
  | "execution_error";

export interface TestCaseResult {
  id: string;
  label: string;
  status:
    | "passed"
    | "failed"
    | "compilation_error"
    | "runtime_error"
    | "time_limit_exceeded"
    | "execution_error"
    | "pending";
  durationMs?: number;
  expectedOutput?: string;
  actualOutput?: string;
  stdout?: string;
  stderr?: string;
  errorMessage?: string;
}

export interface ExecutionResult {
  status: ExecutionStatus;
  summary: string;
  isMock: boolean;
  completedAt: string;
  tests: TestCaseResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  allPassed: boolean;
  mode: ExecutionMode;
  attemptId?: string;
  errorMessage?: string;
}

export type ExecutionMode = "run" | "submit";

export type AttemptOutcome =
  | "passed"
  | "wrong_answer"
  | "syntax_error"
  | "runtime_error"
  | "timeout"
  | "infrastructure_error";

export interface LearnerProfile {
  id: string;
  email?: string;
  displayName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MissionAttemptRecord {
  id: string;
  learnerId: string;
  missionId: string;
  executionStatus: AttemptOutcome;
  passedTests: number;
  totalTests: number;
  mode: ExecutionMode;
  hintLevel?: number;
  mistakeCategory?: string;
  createdAt: string;
}

export interface MissionCompletionRecord {
  id: string;
  learnerId: string;
  missionId: string;
  completedAt: string;
  passedTests: number;
  totalTests: number;
}

export interface LearnerMistakeRecord {
  id: string;
  learnerId: string;
  missionId: string;
  category: string;
  occurrenceCount: number;
  lastSeenAt: string;
}

export interface ProgressSummary {
  missionsCompleted: number;
  totalAttempts: number;
  successRate: number;
  currentLearningProgress: number;
  recentAttempts: MissionAttemptRecord[];
  repeatedMistakes: LearnerMistakeRecord[];
  empty: boolean;
}

export type MentorMistakeCategory =
  | "PASSED"
  | "OFF_BY_ONE"
  | "INCORRECT_LOGIC"
  | "SYNTAX_OR_RUNTIME"
  | "OUTPUT_FORMAT_MISMATCH"
  | "UNKNOWN_ERROR";

export interface MentorResponse {
  category: MentorMistakeCategory;
  explanation: string;
  hint: string;
  hintLevel: 1 | 2 | 3;
  isFallback: boolean;
  recommendedNextMissionId?: string;
}
