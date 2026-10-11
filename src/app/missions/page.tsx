import Link from "next/link";
import { Logo } from "@/components/Logo";
import { MissionGrid } from "@/components/MissionGrid";
import { SectionLabel } from "@/components/SectionLabel";
import { missions } from "@/lib/missions";

export default function MissionsPage() {
  return <div className="min-h-screen bg-[#080808] text-neutral-200"><header className="border-b border-[#292929] bg-[#080808]/90 backdrop-blur-xl"><div className="mx-auto flex h-16 w-[min(1180px,calc(100%-40px))] items-center justify-between"><Logo /><Link href="/" className="text-sm text-neutral-400 transition hover:text-white">Back to overview <span aria-hidden="true">↗</span></Link></div></header><main className="mx-auto w-[min(1180px,calc(100%-40px))] py-16 sm:py-24"><div className="mb-16 max-w-2xl"><SectionLabel>Mission control / beginner path</SectionLabel><h1 className="text-5xl font-semibold leading-[0.98] tracking-[-0.07em] text-white sm:text-7xl">Choose your next <span className="text-neutral-400">small win.</span></h1><p className="mt-6 max-w-xl text-base leading-7 text-neutral-400">Five focused Python missions to help you practice the fundamentals without losing the thread of why the code works.</p></div><MissionGrid missions={missions} /></main><footer className="border-t border-[#292929] px-5 py-8"><div className="mx-auto flex w-[min(1180px,100%)] justify-between text-xs text-neutral-600"><span>CodeQuest AI</span><span>Mock mission data · backend-ready contracts</span></div></footer></div>;
}
