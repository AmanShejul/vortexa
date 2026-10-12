import { NextResponse } from "next/server";
import { getMission } from "@/lib/missions";

// Public mission detail. Execution cases, including hidden tests, remain
// server-owned and are never included in this response.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !/^[a-z0-9-]{1,80}$/.test(id)) {
    return NextResponse.json({ error: "A valid mission ID is required." }, { status: 400 });
  }

  const mission = getMission(id);
  if (!mission) {
    return NextResponse.json({ error: "Mission not found." }, { status: 404 });
  }

  return NextResponse.json({ mission }, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}
