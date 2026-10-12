"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AuthWidget } from "@/components/AuthWidget";
import { Logo } from "@/components/Logo";

const links = [
  { href: "/#features", label: "Why CodeQuest" },
  { href: "/missions", label: "Missions" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/#how-it-works", label: "How it works" },
];

function DashboardIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2.5 13.5V9.75M6.25 13.5V6.5M10 13.5V3.25M13.5 13.5V1.75" strokeLinecap="round" />
    </svg>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="absolute inset-x-0 top-0 z-50 border-b border-[#292929] bg-[#080808]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] w-[min(1180px,calc(100%-32px))] items-center justify-between gap-4 sm:w-[min(1180px,calc(100%-40px))]">
        <Logo />
        <button
          type="button"
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#404040] text-white transition hover:border-[#737373] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:hidden"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-primary-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="text-xl" aria-hidden="true">{open ? "×" : "≡"}</span>
        </button>
        <nav className="hidden min-w-0 items-center gap-6 lg:flex" aria-label="Primary navigation">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-2 text-sm transition ${pathname === link.href ? "bg-[#161616] text-white" : "text-neutral-400 hover:text-white"}`}
            >
              {link.href === "/dashboard" && <DashboardIcon />}
              <span>{link.label}</span>
            </Link>
          ))}
          <AuthWidget />
        </nav>
      </div>
      {open && (
        <nav id="mobile-primary-navigation" className="border-t border-[#292929] bg-[#101010] px-4 py-4 lg:hidden" aria-label="Mobile primary navigation">
          <div className="mx-auto flex w-[min(1180px,100%)] flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-3 text-sm transition ${pathname === link.href ? "bg-[#161616] text-white" : "text-neutral-300 hover:bg-[#161616] hover:text-white"}`}
              >
                {link.href === "/dashboard" && <DashboardIcon />}
                {link.label}
              </Link>
            ))}
            <div className="mt-3 border-t border-[#292929] pt-3">
              <AuthWidget />
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
