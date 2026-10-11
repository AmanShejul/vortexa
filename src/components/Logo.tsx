import Link from "next/link";

export function Logo() {
  return <Link href="/" className="group inline-flex items-center gap-2.5" aria-label="CodeQuest AI home"><span className="relative grid size-8 place-items-center rounded-xl border border-[#737373] bg-[#101010]"><span className="absolute size-2.5 rounded-full bg-white" /><span className="absolute h-4 w-1 rotate-45 rounded-full bg-[#737373]" /></span><span className="text-[15px] font-semibold tracking-[-0.03em] text-white">CodeQuest <span className="text-neutral-400">AI</span></span></Link>;
}
