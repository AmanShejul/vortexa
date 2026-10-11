import { NextResponse } from "next/server";
import { missions } from "@/lib/missions";

export function GET() {
  return NextResponse.json({
    success: true,
    count: missions.length,
    missions: missions.map(({ id, title, shortDescription, description, difficulty, category, concepts, durationMinutes, examples, constraints, execution }) => ({
      id,
      title,
      shortDescription,
      description,
      difficulty,
      category,
      concepts,
      durationMinutes,
      examples,
      constraints,
      execution,
    })),
  });
}
