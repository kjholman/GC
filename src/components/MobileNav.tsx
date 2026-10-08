"use client";

import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { Nav } from "./Nav";

/** Top bar with a slide-out menu, used below the large breakpoint in place of the sidebar. */
export function MobileNav({ items, footer }: { items: { href: string; label: string; icon: string }[]; footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between bg-navy-900 px-4 lg:hidden">
        <Logo on="dark" size="sm" />
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-navy-950/60" />
          <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto bg-navy-900 text-white shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-6">
              <div>
                <Logo on="dark" size="sm" />
                <div className="mt-3 text-[10.5px] font-medium uppercase tracking-[0.22em] text-brand-300/80">GAIA</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-10 w-10 items-center justify-center rounded-lg text-white/70 hover:bg-white/10">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <Nav items={items} onNavigate={() => setOpen(false)} />
            <div className="mt-auto border-t border-white/10 px-5 py-5">{footer}</div>
          </div>
        </div>
      )}
    </>
  );
}
