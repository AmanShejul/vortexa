import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-4 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500"><span className="h-px w-6 bg-neutral-500" />{children}</p>;
}
