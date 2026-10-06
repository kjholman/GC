"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export function SubNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((i) => {
        const active = i.href === items[0].href ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cx(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-[13.5px] transition-colors",
              active ? "border-brand-500 font-medium text-navy-900" : "border-transparent text-muted hover:text-navy-800",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
