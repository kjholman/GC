import { cx } from "@/components/ui";
import type { PersonCredit } from "@/lib/credits/limits";

export const usd = (n: number) => `US$${n.toFixed(2)}`;

export function CreditBadge({ p }: { p: Pick<PersonCredit, "isAdmin" | "cutOff" | "blocked" | "limitUsd" | "usedUsd"> }) {
  const [label, cls] = p.isAdmin
    ? ["Administrator, no limit", "bg-navy-50 text-navy-800"]
    : p.cutOff
      ? ["Switched off", "bg-neg-bg text-neg"]
      : p.blocked === "used_up"
        ? ["Used up", "bg-neg-bg text-neg"]
        : p.limitUsd == null
          ? ["No limit", "bg-[#f0eeed] text-ink-soft"]
          : p.usedUsd / p.limitUsd >= 0.8
            ? ["Running low", "bg-amber-50 text-amber-800"]
            : ["Within allowance", "bg-pos-bg text-pos"];
  return <span className={cx("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", cls)}>{label}</span>;
}

export function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#ebe8e6]" title={`${pct.toFixed(0)}% used`}>
      <div className={cx("h-full rounded-full", pct >= 100 ? "bg-neg" : pct >= 80 ? "bg-amber-500" : "bg-brand-600")} style={{ width: `${pct}%` }} />
    </div>
  );
}
