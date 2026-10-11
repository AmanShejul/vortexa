// Manual smoke check for the canonical local mentor engine.
import { processSubmissionAI } from "./aiMentor.js";

const response = processSubmissionAI(
  "def sum_two_numbers(a, b):\n    return a - b",
  {
    status: "wrong_answer",
    allPassed: false,
    tests: [{ id: "public-1", label: "visible example", status: "failed", expectedOutput: "5", actualOutput: "-1" }]
  },
  { id: "sum-of-two-numbers" },
  1
);

if (response.category !== "INCORRECT_LOGIC" || response.hintLevel !== 1) {
  throw new Error("Local mentor smoke check failed.");
}

console.log("Local mentor smoke check passed.");
