import { NextResponse } from "next/server";
import { generateProgressiveHints } from "../../../../yash/aiMentor.js";
import { getMission } from "@/lib/missions";
import { createMentorEvidenceToken, isMentorEvidenceSigningAvailable, verifyMentorEvidenceToken } from "@/lib/mentor-evidence";
import { getAuthenticatedUser, isSupabaseConfigured } from "@/lib/supabase";
import type { ExecutionMode } from "@/types";

const MAX_BODY_BYTES = 128 * 1024;
const MAX_SOURCE_BYTES = 64 * 1024;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return errorResponse("Hint request is too large.", 413);
    }
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse("Hint request must contain valid JSON.", 400);
  }
  if (!isRecord(body)) return errorResponse("Hint request must be an object.", 400);

  const missionId = body.missionId;
  const sourceCode = body.sourceCode;
  const evidenceToken = body.evidenceToken;
  const mode = body.mode;
  const hintLevel = body.hintLevel;

  if (typeof missionId !== "string" || !/^[a-z0-9-]{1,80}$/.test(missionId)) {
    return errorResponse("A valid mission ID is required.", 400);
  }
  if (!getMission(missionId)) return errorResponse("Unknown mission.", 404);
  if (typeof sourceCode !== "string" || sourceCode.trim().length === 0) {
    return errorResponse("Python source code is required.", 400);
  }
  if (Buffer.byteLength(sourceCode, "utf8") > MAX_SOURCE_BYTES) {
    return errorResponse("Source code is too large.", 413);
  }
  if (typeof evidenceToken !== "string" || evidenceToken.length === 0) {
    return errorResponse("Run your code again to get trusted mentor guidance.", 400);
  }
  if (mode !== "run" && mode !== "submit") {
    return errorResponse("Execution mode must be run or submit.", 400);
  }
  if (typeof hintLevel !== "number" || !Number.isInteger(hintLevel) || hintLevel < 1 || hintLevel > 3) {
    return errorResponse("Hint level must be an integer from 1 to 3.", 400);
  }
  if (!isMentorEvidenceSigningAvailable()) {
    return errorResponse("Mentor evidence signing is unavailable. Check the server configuration.", 503);
  }

  let userId: string | null = null;
  if (isSupabaseConfigured()) {
    try {
      userId = (await getAuthenticatedUser(request))?.id ?? null;
    } catch {
      return errorResponse("Your learner identity could not be verified. Sign in again or rerun your code.", 401);
    }
  }

  const verification = verifyMentorEvidenceToken(evidenceToken, {
    missionId,
    sourceCode,
    mode: mode as ExecutionMode,
    userId,
    hintLevel,
  });
  if (!verification.ok) {
    if (verification.reason === "expired") {
      return errorResponse("This execution evidence has expired. Run your code again for a fresh hint.", 410);
    }
    if (verification.reason === "user_mismatch") {
      return errorResponse("This execution evidence belongs to a different learner. Run your code again.", 403);
    }
    if (verification.reason === "mismatch") {
      return errorResponse("The mission, code, or run mode changed. Run your code again for relevant guidance.", 409);
    }
    if (verification.reason === "hint_level_mismatch") {
      return errorResponse("Reveal the previous hint before requesting the next level.", 409);
    }
    return errorResponse("The mentor evidence is invalid. Run your code again before requesting a hint.", 400);
  }

  const { evidence } = verification;
  if (evidence.status === "execution_error" || evidence.category === "UNKNOWN_ERROR") {
    return errorResponse("This execution did not provide enough reliable evidence for a learner hint. Try running your code again.", 422);
  }

  const guidance = generateProgressiveHints(evidence.category, { status: evidence.status });
  const hintKey = `level${hintLevel}` as "level1" | "level2" | "level3";
  return NextResponse.json({
    category: evidence.category,
    explanation: guidance.explanation,
    hint: guidance[hintKey],
    hintLevel,
    isFallback: true,
    ...(hintLevel < 3
      ? {
          nextEvidenceToken: createMentorEvidenceToken({
            missionId: evidence.missionId,
            sourceCode,
            mode: evidence.mode,
            userId: evidence.userId,
            status: evidence.status,
            category: evidence.category,
            nextHintLevel: (hintLevel + 1) as 2 | 3,
          }),
        }
      : {}),
  });
}
