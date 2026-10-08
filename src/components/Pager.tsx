"use client";

import { useState } from "react";
import { cx } from "./ui";

/**
 * Pages a list that is already on the page. Returns the slice to show and the controls.
 * Going back to page 1 happens automatically when the list changes size (a search or filter).
 */
export function usePaged<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const [len, setLen] = useState(items.length);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  if (len !== items.length) {
    setLen(items.length);
    setPage(1);
  }
  const p = Math.min(page, pages);
  return {
    shown: items.slice((p - 1) * pageSize, p * pageSize),
    offset: (p - 1) * pageSize,
    pager: <PagerControls page={p} pages={pages} pageSize={pageSize} total={items.length} onPage={setPage} />,
  };
}

export function PagerControls({ page, pages, pageSize, total, onPage, className }: {
  page: number; pages: number; pageSize: number; total: number; onPage: (p: number) => void; className?: string;
}) {
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums = [...new Set([1, pages, page - 1, page, page + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const btn = "flex h-8 min-w-8 items-center justify-center rounded-lg px-2.5 text-[13px] tabular";
  return (
    <nav className={cx("flex flex-wrap items-center justify-between gap-3 px-1 py-3", className)} aria-label="Pages">
      <span className="text-[12.5px] text-muted">{from} to {to} of {total}</span>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={cx(btn, page <= 1 ? "text-line-strong" : "text-ink-soft hover:bg-paper")}>← Previous</button>
        {nums.map((n, i) => (
          <span key={n} className="flex items-center gap-1">
            {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
            <button type="button" onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined} className={cx(btn, n === page ? "bg-navy-900 text-white" : "text-ink-soft hover:bg-paper")}>{n}</button>
          </span>
        ))}
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={cx(btn, page >= pages ? "text-line-strong" : "text-ink-soft hover:bg-paper")}>Next →</button>
      </div>
    </nav>
  );
}

/** For server components: wraps already-rendered rows (as a list element) and pages them. */
export function Paged({ children, pageSize, as: Tag = "div", className, pagerClassName }: {
  children: React.ReactNode[]; pageSize: number; as?: "div" | "ul" | "ol"; className?: string; pagerClassName?: string;
}) {
  const { shown, offset, pager } = usePaged(children, pageSize);
  return (
    <>
      <Tag className={className} start={Tag === "ol" ? offset + 1 : undefined}>{shown}</Tag>
      {pager && <div className={pagerClassName}>{pager}</div>}
    </>
  );
}

/** A table whose body rows are paged; the pager sits below the table. */
export function PagedTable({ head, rows, pageSize, className, bodyClassName, pagerClassName }: {
  head: React.ReactNode; rows: React.ReactNode[]; pageSize: number; className?: string; bodyClassName?: string; pagerClassName?: string;
}) {
  const { shown, pager } = usePaged(rows, pageSize);
  return (
    <>
      <table className={className}>
        {head}
        <tbody className={bodyClassName}>{shown}</tbody>
      </table>
      <div className={pagerClassName}>{pager}</div>
    </>
  );
}
