import { notFound } from "next/navigation";
import { ArenaWorkspace } from "@/components/ArenaWorkspace";
import { getMission, missions } from "@/lib/missions";

export function generateStaticParams() {
  return missions.map((mission) => ({ missionId: mission.id }));
}

export default async function ArenaPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const mission = getMission(missionId);
  if (!mission) notFound();
  return <ArenaWorkspace mission={mission} />;
}
