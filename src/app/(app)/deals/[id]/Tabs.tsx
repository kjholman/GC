"use client";

import { useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

/** Memo sections: a tab row on wider screens, a section picker on phones (13 tabs don't fit a phone). */
export function Tabs({ tabs }: { tabs: { id: string; label: string; badge?: string | number; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <label className="no-print sticky top-0 z-10 -mx-1 mb-6 flex items-center gap-2 border-b border-line bg-mist/95 px-1 py-2.5 backdrop-blur sm:hidden">
        <span className="shrink-0 text-[12px] font-medium text-muted">Section</span>
        <select
          value={active}
          onChange={(e) => setActive(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-paper px-3 text-[14px] text-ink"
        >
          {tabs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
              {t.badge != null ? ` (${t.badge})` : ""}
            </option>
          ))}
        </select>
      </label>
      <div role="tablist" className="no-print sticky top-0 z-10 -mx-1 mb-8 hidden gap-1 overflow-x-auto border-b border-line bg-mist/95 px-1 backdrop-blur sm:flex">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={cx(
              "relative -mb-px whitespace-nowrap border-b-2 px-4 py-3 text-[13.5px] transition-colors",
              active === t.id ? "border-brand-500 font-medium text-navy-900" : "border-transparent text-muted hover:text-navy-800",
            )}
          >
            {t.label}
            {t.badge != null && (
              <span className="ml-2 rounded-full bg-navy-50 px-1.5 py-px text-[10.5px] tabular text-navy-700">{t.badge}</span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" className={active === t.id ? "block" : "hidden print:block"}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
