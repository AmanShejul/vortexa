import Link from "next/link";
import type { Mission } from "@/types";

export function MissionCard({ mission }: { mission: Mission }) {
  return (
    <Link
      href={`/arena/${mission.id}`}
      aria-label={`Open ${mission.title}, ${mission.difficulty} mission`}
      className="group flex min-h-[260px] min-w-0 flex-col rounded-2xl border border-[#292929] bg-[#101010] p-5 transition-colors hover:border-[#525252] hover:bg-[#141414] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-lg border border-[#303030] bg-[#171717] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-300">
          {mission.category}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-500">{mission.difficulty}</span>
      </div>

      <div className="mt-7 min-w-0">
        <h3 className="break-words text-lg font-semibold leading-6 tracking-[-0.025em] text-white">{mission.title}</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-400">{mission.shortDescription}</p>
      </div>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-6">
        <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="Mission concepts">
          {mission.concepts.map((concept) => (
            <span key={concept} className="rounded-md border border-[#292929] px-2 py-1 text-[10px] text-neutral-500">{concept}</span>
          ))}
          {mission.durationMinutes !== undefined && (
            <span className="px-1 py-1 text-[10px] text-neutral-500">{mission.durationMinutes} min</span>
          )}
        </div>
        <span className="shrink-0 text-sm font-semibold text-neutral-200 transition group-hover:text-white">
          Open mission <span aria-hidden="true">↗</span>
        </span>
      </div>
    </Link>
  );
}
