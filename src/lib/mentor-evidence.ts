import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ExecutionMode, ExecutionStatus, MentorMistakeCategory } from "@/types";

const EVIDENCE_TTL_MS = 10 * 60 * 1000;
const MAX_TOKEN_LENGTH = 2048;
const EXECUTION_STATUSES = new Set<ExecutionStatus>([
  "passed",
  "wrong_answer",
  "compilation_error",
  "runtime_error",
  "time_limit_exceeded",
  "execution_error",
]);
const MISTAKE_CATEGORIES = new Set<MentorMistakeCategory>([
  "PASSED",
  "OFF_BY_ONE",
  "INCORRECT_LOGIC",
  "SYNTAX_OR_RUNTIME",
  "OUTPUT_FORMAT_MISMATCH",
  "UNKNOWN_ERROR",
]);
const configuredSecret = process.env.MENTOR_EVIDENCE_SECRET?.trim() || undefined;
const configuredSecretIsValid = configuredSecret === undefined || Buffer.byteLength(configuredSecret, "utf8") >= 32;

interface MentorEvidenceClaims {
  version: 1;
  missionId: string;
  codeHash: string;
  mode: ExecutionMode;
  userId: string | null;
  status: ExecutionStatus;
  category: MentorMistakeCategory;
  nextHintLevel: 1 | 2 | 3;
  issuedAt: number;
  expiresAt: number;
}

export type MentorEvidenceVerification =
  | { ok: true; evidence: MentorEvidenceClaims }
  | { ok: false; reason: "malformed" | "expired" | "mismatch" | "user_mismatch" | "hint_level_mismatch" };

const processState = globalThis as typeof globalThis & { __vortexaMentorEvidenceKey?: Buffer };
const signingKey = configuredSecret && configuredSecretIsValid
  ? createHmac("sha256", configuredSecret).update("vortexa:mentor-evidence:v1").digest()
  : processState.__vortexaMentorEvidenceKey ?? (processState.__vortexaMentorEvidenceKey = randomBytes(32));

export function isMentorEvidenceSigningAvailable(): boolean {
  return configuredSecretIsValid;
}

export function hashMentorCode(sourceCode: string): string {
  return createHash("sha256").update(sourceCode, "utf8").digest("hex");
}

export function createMentorEvidenceToken(
  evidence: Omit<MentorEvidenceClaims, "version" | "codeHash" | "issuedAt" | "expiresAt" | "nextHintLevel">
    & { sourceCode: string; nextHintLevel?: 1 | 2 | 3 },
  now = Date.now(),
): string {
  if (!configuredSecretIsValid) {
    throw new Error("MENTOR_EVIDENCE_SECRET must contain at least 32 bytes.");
  }
  const claims: MentorEvidenceClaims = {
    version: 1,
    missionId: evidence.missionId,
    codeHash: hashMentorCode(evidence.sourceCode),
    mode: evidence.mode,
    userId: evidence.userId,
    status: evidence.status,
    category: evidence.category,
    nextHintLevel: evidence.nextHintLevel ?? 1,
    issuedAt: now,
    expiresAt: now + EVIDENCE_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", signingKey).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function isClaims(value: unknown): value is MentorEvidenceClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const claims = value as Record<string, unknown>;
  return claims.version === 1
    && typeof claims.missionId === "string"
    && /^[a-z0-9-]{1,80}$/.test(claims.missionId)
    && typeof claims.codeHash === "string"
    && /^[a-f0-9]{64}$/.test(claims.codeHash)
    && (claims.mode === "run" || claims.mode === "submit")
    && (claims.userId === null || typeof claims.userId === "string")
    && typeof claims.status === "string"
    && EXECUTION_STATUSES.has(claims.status as ExecutionStatus)
    && typeof claims.category === "string"
    && MISTAKE_CATEGORIES.has(claims.category as MentorMistakeCategory)
    && (claims.nextHintLevel === 1 || claims.nextHintLevel === 2 || claims.nextHintLevel === 3)
    && typeof claims.issuedAt === "number"
    && Number.isSafeInteger(claims.issuedAt)
    && typeof claims.expiresAt === "number"
    && Number.isSafeInteger(claims.expiresAt);
}

export function verifyMentorEvidenceToken(
  token: string,
  expected: {
    missionId: string;
    sourceCode: string;
    mode: ExecutionMode;
    userId: string | null;
    hintLevel: number;
  },
  now = Date.now(),
): MentorEvidenceVerification {
  if (!configuredSecretIsValid) return { ok: false, reason: "malformed" };
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };

  let signature: Buffer;
  let claimsValue: unknown;
  try {
    signature = Buffer.from(parts[1], "base64url");
    const expectedSignature = createHmac("sha256", signingKey).update(parts[0]).digest();
    if (signature.length !== expectedSignature.length || !timingSafeEqual(signature, expectedSignature)) {
      return { ok: false, reason: "malformed" };
    }
    claimsValue = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as unknown;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!isClaims(claimsValue)) return { ok: false, reason: "malformed" };
  const evidence = claimsValue;
  if (evidence.expiresAt <= now || evidence.issuedAt > now + 30_000 || evidence.expiresAt - evidence.issuedAt !== EVIDENCE_TTL_MS) {
    return { ok: false, reason: "expired" };
  }
  if (evidence.userId !== expected.userId) return { ok: false, reason: "user_mismatch" };
  if (evidence.nextHintLevel !== expected.hintLevel) return { ok: false, reason: "hint_level_mismatch" };
  if (
    evidence.missionId !== expected.missionId
    || evidence.mode !== expected.mode
    || evidence.codeHash !== hashMentorCode(expected.sourceCode)
  ) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, evidence };
}
