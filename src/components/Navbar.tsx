"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/Logo";

const links = [{ href: "/#features", label: "Why CodeQuest" }, { href: "/missions", label: "Missions" }, { href: "/#how-it-works", label: "How it works" }];

export function Navbar() {
  const [open, setOpen] = useState(false);
  return <header className="absolute inset-x-0 top-0 z-50 border-b border-[#292929] bg-[#080808]/90 backdrop-blur-xl"><div className="mx-auto flex h-[72px] w-[min(1180px,calc(100%-40px))] items-center justify-between"><Logo /><button type="button" className="grid size-10 place-items-center rounded-xl border border-[#404040] text-white md:hidden" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen((value) => !value)}><span className="text-xl">{open ? "×" : "≡"}</span></button><nav className="hidden items-center gap-8 md:flex" aria-label="Primary navigation">{links.map((link) => <Link key={link.href} href={link.href} className="text-sm text-neutral-400 transition hover:text-white">{link.label}</Link>)}<Link href="/missions" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200">Start coding <span aria-hidden="true">↗</span></Link></nav></div>{open && <nav className="border-t border-[#292929] bg-[#101010] px-5 py-4 md:hidden" aria-label="Mobile navigation"><div className="mx-auto flex w-[min(1180px,100%)] flex-col gap-1">{links.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm text-neutral-300 hover:bg-[#161616] hover:text-white">{link.label}</Link>)}<Link href="/missions" onClick={() => setOpen(false)} className="mt-2 rounded-xl bg-white px-3 py-3 text-center text-sm font-semibold text-black">Start coding</Link></div></nav>}</header>;
}
