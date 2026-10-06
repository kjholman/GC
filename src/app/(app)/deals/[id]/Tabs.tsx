"use client";

import { useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

export function Tabs({ tabs }: { tabs: { id: string; label: string; badge?: string | number; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <div className="no-print sticky top-0 z-10 -mx-1 mb-8 flex gap-1 overflow-x-auto border-b border-line bg-mist/95 px-1 backdrop-blur">
        {tabs.map((t) => (
          <button
            key={t.id}
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
        <div key={t.id} className={active === t.id ? "block" : "hidden print:block"}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
