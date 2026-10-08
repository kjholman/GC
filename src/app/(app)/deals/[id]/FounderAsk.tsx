import type { Memo } from "@/lib/ai/schema";
import { cx } from "@/components/ui";
import { Tagged } from "./Memo";
import { CopyButton } from "./CopyButton";

const ORDER = { CRITICAL: 0, IMPORTANT: 1, SUPPLEMENTARY: 2 } as const;
const PRI: Record<string, { label: string; cls: string }> = {
  CRITICAL: { label: "Must have", cls: "bg-neg text-white" },
  IMPORTANT: { label: "Important", cls: "bg-warn text-white" },
  SUPPLEMENTARY: { label: "Nice to have", cls: "bg-navy-100 text-navy-700" },
};

const plain = (t: string) => t.replace(/\s?\[E\d+\]/g, "").trim();

/** Top of a deal waiting on the founders: exactly what to ask for, in order, ready to copy. */
export function FounderAsk({ memo, hasEmail }: { memo: Memo; hasEmail: boolean }) {
  const items = [...memo.informationRequests].sort((a, b) => ORDER[a.priority] - ORDER[b.priority]);
  if (!items.length) return null;
  const must = items.filter((r) => r.priority === "CRITICAL").length;
  const copyText = [
    "Information requested:",
    ...items.map((r, i) => `${i + 1}. ${plain(r.request)}${r.priority === "CRITICAL" ? " (essential)" : ""}`),
  ].join("\n");
  return (
    <section id="founder-ask" className="rounded-xl border-2 border-warn bg-warn-bg/70 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow !text-warn">Waiting on the founders</div>
          <h2 className="mt-1 font-display text-[22px] font-semibold leading-tight text-navy-900">
            Ask the founders for {items.length} thing{items.length === 1 ? "" : "s"}
            {must ? <span className="text-neg">{` (${must} essential)`}</span> : null}
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-soft">
            GAIA can&apos;t make a decision until these come back. {hasEmail ? "The Founder response tab has an email asking for them, ready to send." : "Copy the list into your email to the founders."} When they reply, upload what they send under &ldquo;Founders replied?&rdquo; and GAIA updates the analysis.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <CopyButton text={copyText} label="Copy the list" />
          <a href="#founders-replied" className="inline-flex items-center rounded-lg bg-navy-900 px-4 py-2 text-[13.5px] font-medium text-white hover:bg-navy-800">
            Founders replied?
          </a>
        </div>
      </div>
      <ol className="mt-5 space-y-2.5">
        {items.map((r, i) => (
          <li key={i} className="flex gap-3 rounded-lg border border-[#efdcb4] bg-paper px-4 py-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[12px] font-semibold text-white">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", PRI[r.priority].cls)}>{PRI[r.priority].label}</span>
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{r.category}</span>
              </div>
              <p className="mt-1 text-[14.5px] font-medium leading-snug text-ink"><Tagged text={r.request} /></p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft"><span className="font-medium">Why: </span><Tagged text={r.rationale} /></p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
