import { NextResponse } from "next/server";
import { missions } from "@/lib/missions";

export function GET() {
  return NextResponse.json({
    success: true,
    count: missions.length,
    missions: missions.map(({ id, slug, title, shortDescription, description, difficulty, category, topic, concepts, hintMetadata, durationMinutes, examples, constraints, execution }) => ({
      id,
      slug,
      title,
      shortDescription,
      description,
      difficulty,
      category,
      topic,
      concepts,
      hintMetadata,
      durationMinutes,
      examples,
      constraints,
      execution,
    })),
  });
}
