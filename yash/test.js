// Test script for AI Mentor logic
function classifyMistake(userCode, testResults) {
  const failedTests = testResults.filter((t) => !t.passed);
  if (failedTests.length === 0) return 'UNKNOWN_ERROR';
  const combinedErrors = failedTests.map((t) => t.errorMessage || '').join('\n');
  if (combinedErrors.includes('IndexError')) return 'OFF_BY_ONE';
  return 'INCORRECT_LOGIC';
}

function generateProgressiveHints(mistakeType) {
  if (mistakeType === 'OFF_BY_ONE') {
    return {
      explanation: "Your code is trying to access an element beyond the list's boundary.",
      level1: "💡 Hint 1: Remember that Python lists are zero-indexed! The first item is at index 0.",
      level2: "🔍 Hint 2: Check your loop range up to len(lst) - 1.",
      level3: "⚙️ Hint 3: Use `<` instead of `<=` in your loop condition."
    };
  }
}

// Mock Test
const mockTestResults = [{ passed: false, errorMessage: 'IndexError: list index out of range' }];
const mistake = classifyMistake("for i in range(len(lst)): print(lst[i])", mockTestResults);
const hints = generateProgressiveHints(mistake);

console.log("=== 🚀 AI MENTOR TEST OUTPUT ===");
console.log("Detected Mistake:", mistake);
console.log("Generated Hints:", hints);
console.log("================================");