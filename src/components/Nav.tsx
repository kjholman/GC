"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ICONS: Record<string, React.ReactNode> = {
  overview: <path d="M3 13h7V3H3v10Zm0 8h7v-6H3v6Zm11 0h7V11h-7v10Zm0-18v6h7V3h-7Z" />,
  pipeline: <path d="M3 5h18M6 12h12M10 19h4" strokeWidth="1.8" stroke="currentColor" fill="none" strokeLinecap="round" />,
  new: <path d="M12 5v14M5 12h14" strokeWidth="1.8" stroke="currentColor" fill="none" strokeLinecap="round" />,
  knowledge: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15ZM4 20.5A2.5 2.5 0 0 0 6.5 23H20" strokeWidth="1.6" stroke="currentColor" fill="none" />,
  training: <path d="M12 3 2 8l10 5 10-5-10-5Zm-6 7.2V15c0 1.7 2.7 3.5 6 3.5s6-1.8 6-3.5v-4.8" strokeWidth="1.6" stroke="currentColor" fill="none" strokeLinejoin="round" />,
  admin: <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" strokeWidth="1.6" stroke="currentColor" fill="none" />,
};

export function Nav({ items, onNavigate }: { items: { href: string; label: string; icon: string }[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  // Only the most specific match is highlighted, so /deals/new lights up "New screening", not "Deal pipeline" too.
  const matches = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const activeHref = items.map((i) => i.href).filter(matches).sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cx(
              "group mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors",
              active
                ? "bg-white/[0.09] font-medium text-white shadow-[inset_3px_0_0_#29a2b5]"
                : "text-white/65 hover:bg-white/[0.05] hover:text-white",
            )}
          >
            <svg viewBox="0 0 24 24" className={cx("h-[17px] w-[17px]", active ? "text-brand-400" : "text-white/45")} fill="currentColor">
              {ICONS[item.icon]}
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
