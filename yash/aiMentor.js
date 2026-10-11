// --- 1. Interfaces & Types ---
export interface TestResult {
  testId: string;
  passed: boolean;
  status: 'Passed' | 'Wrong Output' | 'Runtime Error' | 'Timeout';
  errorMessage?: string;
  actualOutput?: string;
}

export type MistakeCategory =
  | 'OFF_BY_ONE'
  | 'EMPTY_INPUT_UNHANDLED'
  | 'TYPE_MISMATCH'
  | 'INFINITE_LOOP'
  | 'SYNTAX_ERROR'
  | 'INCORRECT_LOGIC'
  | 'UNKNOWN_ERROR';

export interface AIMentorResponse {
  mistakeType: MistakeCategory;
  explanation: string;
  availableHints: {
    level1: string;
    level2: string;
    level3: string;
  };
  updatedMistakeDNA: string[];
  recommendedNextMissionTag: string;
}

// --- 2. Mistake Classification Engine ---
export function classifyMistake(userCode: string, testResults: TestResult[]): MistakeCategory {
  const failedTests = testResults.filter((t) => !t.passed);
  if (failedTests.length === 0) return 'UNKNOWN_ERROR';

  const combinedErrors = failedTests.map((t) => t.errorMessage || '').join('\n');

  if (failedTests.some((t) => t.status === 'Timeout')) return 'INFINITE_LOOP';
  if (combinedErrors.includes('IndexError')) return 'OFF_BY_ONE';
  if (combinedErrors.includes('TypeError')) return 'TYPE_MISMATCH';
  if (combinedErrors.includes('SyntaxError') || combinedErrors.includes('IndentationError')) return 'SYNTAX_ERROR';
  if (combinedErrors.includes('AttributeError') || combinedErrors.includes('ValueError')) return 'EMPTY_INPUT_UNHANDLED';

  if (failedTests.some((t) => t.status === 'Wrong Output')) {
    if (userCode.includes('range(len(') && !userCode.includes(' - 1')) {
      return 'OFF_BY_ONE';
    }
    return 'INCORRECT_LOGIC';
  }

  return 'UNKNOWN_ERROR';
}

// --- 3. 3-Tier Progressive Hint Generator ---
export function generateProgressiveHints(mistakeType: MistakeCategory) {
  switch (mistakeType) {
    case 'OFF_BY_ONE':
      return {
        explanation: "Your code is trying to access an element beyond the list's boundary.",
        level1: "💡 Hint 1: Remember that Python lists are zero-indexed! The first item is at index 0.",
        level2: "🔍 Hint 2: Check your loop range. `range(len(lst))` goes up to `len(lst) - 1`.",
        level3: "⚙️ Hint 3: Adjust your loop condition or inequality sign (use `<` instead of `<=`)."
      };
    case 'INFINITE_LOOP':
      return {
        explanation: "Your code ran for too long and timed out. A loop condition never became false.",
        level1: "💡 Hint 1: Check your `while` loops. Are you updating your counter inside the loop?",
        level2: "🔍 Hint 2: Trace your loop variable step by step. Is it reaching the exit condition?",
        level3: "⚙️ Hint 3: Ensure the variable modified inside the loop is the one checked in the condition."
      };
    case 'EMPTY_INPUT_UNHANDLED':
      return {
        explanation: "Your code fails when given an empty input or `None` value.",
        level1: "💡 Hint 1: Consider what happens when the input list or string has a length of 0.",
        level2: "🔍 Hint 2: Add an early check at the beginning of your function for `if not input_data:`.",
        level3: "⚙️ Hint 3: Return a default value (like `0` or `[]`) if the input is empty."
      };
    case 'SYNTAX_ERROR':
      return {
        explanation: "Python cannot parse your code due to invalid syntax or incorrect indentation.",
        level1: "💡 Hint 1: Look closely at colons `:` at the end of `if`, `for`, or `def` lines.",
        level2: "🔍 Hint 2: Check for unclosed parentheses `()`, brackets `[]`, or quotes `\"\"`.",
        level3: "⚙️ Hint 3: Ensure consistent 4-space indentation across all code blocks."
      };
    case 'INCORRECT_LOGIC':
    default:
      return {
        explanation: "Your code ran without errors, but the returned output didn't match the expected output.",
        level1: "💡 Hint 1: Walk through your code line by line using a sample input on paper.",
        level2: "🔍 Hint 2: Compare your visible test outputs with expected outputs.",
        level3: "⚙️ Hint 3: Check edge cases like negative numbers, single-element lists, or duplicate values."
      };
  }
}

// --- 4. Main Function to Process Submission & Return Data for Frontend/DB ---
export function processSubmissionAI(
  userCode: string,
  testResults: TestResult[],
  pastMistakes: string[] = []
): AIMentorResponse {
  const mistakeType = classifyMistake(userCode, testResults);
  const hints = generateProgressiveHints(mistakeType);

  const updatedMistakeDNA = [...pastMistakes];
  if (mistakeType !== 'UNKNOWN_ERROR' && !updatedMistakeDNA.includes(mistakeType)) {
    updatedMistakeDNA.push(mistakeType);
  }

  let recommendedNextMissionTag = 'arrays-basic';
  if (updatedMistakeDNA.includes('OFF_BY_ONE')) recommendedNextMissionTag = 'boundary-conditions-practice';
  else if (updatedMistakeDNA.includes('EMPTY_INPUT_UNHANDLED')) recommendedNextMissionTag = 'edge-case-mastery';
  else if (updatedMistakeDNA.includes('INFINITE_LOOP')) recommendedNextMissionTag = 'loop-invariants';

  return {
    mistakeType,
    explanation: hints.explanation,
    availableHints: {
      level1: hints.level1,
      level2: hints.level2,
      level3: hints.level3
    },
    updatedMistakeDNA,
    recommendedNextMissionTag
  };
}