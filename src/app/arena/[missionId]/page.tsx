import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArenaWorkspace } from "@/components/ArenaWorkspace";
import { getMission, missions } from "@/lib/missions";

export function generateStaticParams() {
  return missions.map((mission) => ({ missionId: mission.id }));
}

function ArenaLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#080808] px-6 text-center text-neutral-200" aria-busy="true">
      <p className="text-sm text-neutral-400">Preparing mission workspace…</p>
    </main>
  );
}

export default function ArenaPage({ params }: { params: Promise<{ missionId: string }> }) {
  return (
    <Suspense fallback={<ArenaLoading />}>
      <ArenaPageContent params={params} />
    </Suspense>
  );
}

async function ArenaPageContent({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const mission = getMission(missionId);
  if (!mission) notFound();
  return <ArenaWorkspace mission={mission} />;
}
