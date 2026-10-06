import Link from "next/link";
import { cx } from "./ui";

/** Page links for server-rendered lists. `href(p)` builds the URL for page p (1-based). */
export function Pagination({ page, pageSize, total, href, className }: {
  page: number; pageSize: number; total: number; href: (page: number) => string; className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  // Show first, last, and two either side of the current page.
  const nums = [...new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const btn = "flex h-8 min-w-8 items-center justify-center rounded-lg px-2.5 text-[13px] tabular";
  return (
    <nav className={cx("flex flex-wrap items-center justify-between gap-3 px-1 py-3", className)} aria-label="Pages">
      <span className="text-[12.5px] text-muted">
        {from} to {to} of {total}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {page > 1 ? <Link href={href(page - 1)} className={cx(btn, "text-ink-soft hover:bg-paper")}>← Previous</Link> : <span className={cx(btn, "text-line-strong")}>← Previous</span>}
        {nums.map((n, i) => (
          <span key={n} className="flex items-center gap-1">
            {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
            {n === page ? (
              <span className={cx(btn, "bg-navy-900 text-white")} aria-current="page">{n}</span>
            ) : (
              <Link href={href(n)} className={cx(btn, "text-ink-soft hover:bg-paper")}>{n}</Link>
            )}
          </span>
        ))}
        {page < pages ? <Link href={href(page + 1)} className={cx(btn, "text-ink-soft hover:bg-paper")}>Next →</Link> : <span className={cx(btn, "text-line-strong")}>Next →</span>}
      </div>
    </nav>
  );
}

/** Reads a 1-based page number from search params. */
export function pageParam(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
