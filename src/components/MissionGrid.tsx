"use client";

import { useMemo, useState } from "react";
import { MissionCard } from "@/components/MissionCard";
import type { Mission, MissionCategory } from "@/types";

const filters: Array<"All" | MissionCategory> = ["All", "Fundamentals", "Conditionals", "Loops", "Arrays", "Strings"];

export function MissionGrid({ missions }: { missions: Mission[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const visibleMissions = useMemo(() => missions.filter((mission) => { const matchesFilter = filter === "All" || mission.category === filter; const searchable = `${mission.title} ${mission.shortDescription} ${mission.concepts.join(" ")}`.toLowerCase(); return matchesFilter && searchable.includes(query.toLowerCase()); }), [filter, missions, query]);
  return <section aria-labelledby="mission-grid-title"><div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><h2 id="mission-grid-title" className="text-lg font-semibold text-white">Beginner missions <span className="ml-2 font-mono text-xs text-neutral-500">{visibleMissions.length}/{missions.length}</span></h2><label className="relative"><span className="sr-only">Search missions</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search missions" className="w-full rounded-xl border border-[#292929] bg-[#101010] px-4 py-2.5 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-[#737373] sm:w-56" /></label></div><div className="mb-7 flex gap-2 overflow-x-auto pb-1" aria-label="Filter missions by concept">{filters.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs transition ${filter === item ? "border-white bg-white text-black" : "border-[#292929] bg-black text-neutral-400 hover:border-[#737373] hover:text-white"}`}>{item}</button>)}</div>{visibleMissions.length > 0 ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleMissions.map((mission) => <MissionCard key={mission.id} mission={mission} />)}</div> : <div className="rounded-2xl border border-dashed border-[#404040] px-6 py-14 text-center"><p className="text-sm font-medium text-white">No missions match that search.</p><p className="mt-2 text-sm text-neutral-500">Try another concept or clear the filter.</p></div>}</section>;
}
