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
}

export type ExecutionStatus =
  | "pending"
  | "running"
  | "passed"
  | "wrong_answer"
  | "runtime_error"
  | "time_limit_exceeded"
  | "execution_error";

export interface TestCaseResult {
  id: string;
  label: string;
  status: "passed" | "failed" | "pending";
  durationMs?: number;
}

export interface ExecutionResult {
  status: ExecutionStatus;
  summary: string;
  isMock: boolean;
  completedAt: string;
  tests: TestCaseResult[];
}

export type ExecutionMode = "run" | "submit";
