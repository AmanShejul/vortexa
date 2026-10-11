"use client";

import { useMemo, useState } from "react";
import { MissionCard } from "@/components/MissionCard";
import type { Mission, MissionCategory } from "@/types";

const filters: Array<"All" | MissionCategory> = ["All", "Fundamentals", "Conditionals", "Loops", "Arrays", "Strings"];

export function MissionGrid({ missions }: { missions: Mission[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const visibleMissions = useMemo(
    () => missions.filter((mission) => {
      const matchesFilter = filter === "All" || mission.category === filter;
      const searchable = `${mission.title} ${mission.shortDescription} ${mission.concepts.join(" ")}`.toLowerCase();
      return matchesFilter && searchable.includes(query.trim().toLowerCase());
    }),
    [filter, missions, query],
  );

  return (
    <section aria-labelledby="mission-grid-title">
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 id="mission-grid-title" className="text-lg font-semibold text-white">Browse missions</h2>
          <p className="mt-1 text-xs text-neutral-500">
            {visibleMissions.length} of {missions.length} missions
          </p>
        </div>
        <label className="block w-full sm:w-64">
          <span className="sr-only">Search missions</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search missions or concepts"
            className="min-h-11 w-full rounded-xl border border-[#353535] bg-[#101010] px-4 text-sm text-white placeholder:text-neutral-500 focus:border-[#737373] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          />
        </label>
      </div>

      <div className="-mx-1 mb-7 overflow-x-auto px-1 pb-2" aria-label="Filter missions by category">
        <div className="flex w-max gap-2">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              aria-pressed={filter === item}
              className={`min-h-10 whitespace-nowrap rounded-lg border px-3 py-2 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                filter === item
                  ? "border-neutral-200 bg-neutral-200 font-semibold text-black"
                  : "border-[#292929] bg-[#101010] text-neutral-400 hover:border-[#525252] hover:text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {visibleMissions.length > 0 ? (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleMissions.map((mission) => <MissionCard key={mission.id} mission={mission} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#404040] px-6 py-14 text-center" role="status">
          <p className="text-sm font-medium text-white">No missions match that search.</p>
          <p className="mt-2 text-sm text-neutral-500">Try another keyword or choose a different category.</p>
        </div>
      )}
    </section>
  );
}
