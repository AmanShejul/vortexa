import { NextResponse } from "next/server";

type Mission = {
  id: string;
  title: string;
  difficulty: "Beginner";
  concepts: string[];
  description: string;
};

const missions: Mission[] = [
  {
    id: "sum-two-numbers",
    title: "Sum of Two Numbers",
    difficulty: "Beginner",
    concepts: ["Input", "Variables", "Arithmetic"],
    description: "Read two integers and print their sum.",
  },
  {
    id: "even-or-odd",
    title: "Even or Odd",
    difficulty: "Beginner",
    concepts: ["Input", "Conditionals", "Modulo"],
    description: "Read an integer and print whether it is even or odd.",
  },
  {
    id: "sum-from-1-to-n",
    title: "Sum from 1 to N",
    difficulty: "Beginner",
    concepts: ["Loops", "Accumulation", "Arithmetic"],
    description:
      "Read a positive integer N and print the sum of all integers from 1 through N.",
  },
  {
    id: "find-largest-number",
    title: "Find the Largest Number",
    difficulty: "Beginner",
    concepts: ["Input", "Comparisons", "Conditionals"],
    description: "Read three numbers and print the largest one.",
  },
  {
    id: "count-vowels",
    title: "Count Vowels",
    difficulty: "Beginner",
    concepts: ["Strings", "Loops", "Conditionals"],
    description: "Read a line of text and count how many vowels it contains.",
  },
];

export function GET() {
  return NextResponse.json({
    success: true,
    count: missions.length,
    missions,
  });
}
