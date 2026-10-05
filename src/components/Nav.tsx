"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ICONS: Record<string, React.ReactNode> = {
  overview: <path d="M3 13h7V3H3v10Zm0 8h7v-6H3v6Zm11 0h7V11h-7v10Zm0-18v6h7V3h-7Z" />,
  pipeline: <path d="M3 5h18M6 12h12M10 19h4" strokeWidth="1.8" stroke="currentColor" fill="none" strokeLinecap="round" />,
  new: <path d="M12 5v14M5 12h14" strokeWidth="1.8" stroke="currentColor" fill="none" strokeLinecap="round" />,
  knowledge: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15ZM4 20.5A2.5 2.5 0 0 0 6.5 23H20" strokeWidth="1.6" stroke="currentColor" fill="none" />,
  admin: <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" strokeWidth="1.6" stroke="currentColor" fill="none" />,
};

export function Nav({ items }: { items: { href: string; label: string; icon: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "group flex items-center gap-3 border-l-2 px-4 py-2.5 text-[13.5px] transition-colors",
              active
                ? "border-gold-500 bg-white/[0.06] text-white"
                : "border-transparent text-white/60 hover:bg-white/[0.03] hover:text-white",
            )}
          >
            <svg viewBox="0 0 24 24" className={cx("h-[17px] w-[17px]", active ? "text-gold-300" : "text-white/45")} fill="currentColor">
              {ICONS[item.icon]}
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
