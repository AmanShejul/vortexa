import { NextResponse } from "next/server";
import { getMission } from "@/lib/missions";
import { getMissionTestCases } from "@/lib/mission-tests";

export function GET(request: Request) {
  const missionId = new URL(request.url).searchParams.get("missionId");
  if (!missionId || !/^[a-z0-9-]{1,80}$/.test(missionId)) {
    return NextResponse.json({ error: "A valid mission ID is required." }, { status: 400 });
  }

  const mission = getMission(missionId);
  if (!mission) return NextResponse.json({ error: "Unknown mission." }, { status: 404 });

  const publicTests = getMissionTestCases(missionId, "run");

  return NextResponse.json({
    execution: mission.execution,
    tests: publicTests,
  });
}
